// Local-only, no dependencies, providers or credentials. Each child is a DB session.
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const container = 'supabase_db_Reporty';
const ports = execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8' });
assert.match(ports, /:54322\b/, 'Refusing a database not mapped to local port 54322');
const args = ['exec', '-i', container, 'psql', '-X', '-qAt', '-h', '127.0.0.1',
  '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-w', '-v', 'ON_ERROR_STOP=1'];
const sessions = [];
function session() {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = ''; let stderr = ''; let pending; let sequence = 0;
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    buffer += data;
    if (pending && buffer.includes(pending.marker + '\n')) {
      const result = buffer.slice(0, buffer.indexOf(pending.marker)).trim();
      buffer = buffer.slice(buffer.indexOf(pending.marker) + pending.marker.length + 1);
      clearTimeout(pending.timer);
      pending.resolve(result);
      pending = undefined;
    }
  });
  child.on('exit', code => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`psql exit ${code}: ${stderr}`));
      pending = undefined;
    }
  });
  const s = {
    query(sql) {
      assert.equal(pending, undefined, 'One query at a time per session');
      return new Promise((resolve, reject) => {
        const marker = `END_${++sequence}_${randomUUID()}`;
        const timer = setTimeout(() => { reject(new Error(`Session timeout: ${stderr}`)); child.kill(); }, 15000);
        pending = { marker, timer, resolve, reject };
        child.stdin.write(`${sql}\n\\echo ${marker}\n`);
      });
    },
    close() { child.stdin.end('rollback;\n\\q\n'); },
  };
  sessions.push(s);
  return s;
}
const observer = session(); const first = session(); const second = session();
const owner = randomUUID();
const evidence = Array.from({ length: 4 }, () => randomUUID());
const ids = Array.from({ length: 4 }, (_, i) => -1000000000 - randomInt(100000000) * 10 - i);
let fixtures = false;
const decision = i => `select public.decidir_imagen_moderacion('${evidence[i]}',null,'REJECTED','[]','${owner}');`;
const credit = i => `select public.acreditar_puntos_reporte(${ids[i]});`;
const check = async sql => assert.equal(await observer.query(sql), 't', sql);

// Poll observed PostgreSQL blockers, not elapsed time. The contender must really
// overlap and block on the holder before COMMIT releases it.
async function blocked(waiter, holder) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const result = await observer.query(`select ${holder}=any(pg_catalog.pg_blocking_pids(${waiter}));`);
    if (result === 't') return;
  }
  throw new Error('Expected overlapping lock barrier was not observed');
}
async function race(winnerSql, contenderSql, expectedContender) {
  assert.equal(await first.query(`begin; set local role service_role; ${winnerSql}`), 't');
  const contender = second.query(`begin; set local role service_role; ${contenderSql}`);
  // Attach a rejection handler immediately while the lock observer runs.
  contender.catch(() => {});
  await blocked(second.pid, first.pid);
  await first.query('commit;');
  assert.equal(await contender, expectedContender);
  await second.query('commit;');
}
try {
  for (const s of sessions) {
    const address = await s.query("select host(inet_server_addr()) || ':' || inet_server_port();");
    assert.equal(address, '127.0.0.1:5432');
    s.pid = Number(await s.query("set statement_timeout='12s'; set lock_timeout='10s'; select pg_backend_pid();"));
  }
  // No ON CONFLICT: a collision fails instead of adopting someone else's data.
  await observer.query(`begin;
    insert into auth.users(id,email) values ('${owner}','${owner}@ejemplo.invalid');
    update public.profiles set rol_id=1,puntos=17 where id='${owner}';
    ${ids.map((id, i) => `insert into public.reportes(id,usuario_id,titulo,lat,lon,estado_id)
      values (${id},'${owner}','Concurrencia sintética',0,0,null);
      insert into public.moderacion_imagenes(id,reporte_id,propietario_id,hash_sha256,path_privado)
      values ('${evidence[i]}',${id},'${owner}',repeat('e',64),'${owner}/${evidence[i]}');`).join('\n')}
    commit;`);
  fixtures = true;
  await race(credit(0), decision(0), 't');
  await race(decision(1), credit(1), 'f');
  await race(decision(2), decision(2), 'f');
  await check(`select (select puntos=17 from public.profiles where id='${owner}')
    and (select count(*)=3 from public.avisos_retiro_reporte where propietario_id='${owner}')
    and (select count(*)=3 from public.reportes where usuario_id='${owner}' and deleted_at is not null)
    and (select count(*)=1 and bool_and(revertido_at is not null)
      from public.puntos_creacion_reporte where propietario_id='${owner}');`);
  await check(`set role anon; select count(*)=1 and bool_and(deleted_at is null)
    from public.reportes where usuario_id='${owner}'; reset role;`);
  await first.query('begin; set local role service_role;');
  const token = await first.query(`select public.reclamar_aviso_retiro(${ids[2]});`);
  assert.match(token, /^[0-9a-f-]{36}$/);
  const contender = second.query(`begin; set local role service_role;
    select public.reclamar_aviso_retiro(${ids[2]}) is null;`);
  contender.catch(() => {});
  await blocked(second.pid, first.pid);
  await first.query('commit;');
  assert.equal(await contender, 't');
  await second.query('commit;');
  await check(`select intentos=1 and token='${token}'::uuid and estado='reclamado'
    from public.avisos_retiro_reporte where reporte_id=${ids[2]};`);
  assert.equal(await first.query(`set role service_role;
    select public.confirmar_aviso_retiro(${ids[2]},'${token}'); reset role;`), 't');
  console.log('OK concurrency: credit→reject, reject→credit, duplicate reject, duplicate claim (observed lock barriers)');

  // Differential check uses the prior applied migration's validator in a rolled
  // back transaction. No history lookup, fixed commit or permanent base copy.
  const base = await readFile(new URL('../../supabase/migrations/20261025144223_moderacion_imagenes.sql', import.meta.url), 'utf8');
  const validator = base.match(/create function public\.validar_propietario_moderacion\(\)[\s\S]*?\n\$\$;/)?.[0];
  assert.ok(validator, 'Prior validator must exist');
  async function semantics(prior) {
    return observer.query(`begin;
      ${prior ? validator.replace('create function', 'create or replace function') : ''}
      set local role service_role;
      select public.decidir_imagen_moderacion('${evidence[3]}',null,'REVIEW','["review"]','${owner}');
      select decision,estado_publicacion,token is null from public.moderacion_imagenes where id='${evidence[3]}';
      select public.decidir_imagen_moderacion('${evidence[3]}',null,'APPROVED','[]','${owner}');
      select decision,estado_publicacion,token is not null from public.moderacion_imagenes where id='${evidence[3]}';
      select public.confirmar_publicacion_moderacion(id,token,'https://ejemplo.invalid/diferencial')
        from public.moderacion_imagenes where id='${evidence[3]}';
      select public.confirmar_publicacion_moderacion(id,token,'https://ejemplo.invalid/diferencial')
        from public.moderacion_imagenes where id='${evidence[3]}';
      select r.deleted_at is null, m.decision,m.estado_publicacion,
        (select count(*) from public.fotos_reporte f where f.reporte_id=r.id),
        (select count(*) from public.avisos_retiro_reporte a where a.reporte_id=r.id)
        from public.reportes r join public.moderacion_imagenes m on m.reporte_id=r.id where r.id=${ids[3]};
      rollback;`);
  }
  const prior = await semantics(true);
  const current = await semantics(false);
  assert.equal(current, prior);
  assert.equal(current, 't\nREVIEW|pendiente|t\nt\nAPPROVED|publicando|t\nt\nf\nt|APPROVED|publicada|1|0');
  console.log('OK differential REVIEW/APPROVED/publication: exact RPC and visible state outputs match prior validator');
} finally {
  // Roll back any held transactions first; cleanup only UUID-owned test rows.
  await Promise.allSettled([first.query('rollback; reset role;'), second.query('rollback; reset role;')]);
  if (fixtures) {
    await observer.query(`rollback; begin;
      delete from public.avisos_retiro_reporte where propietario_id='${owner}';
      delete from public.puntos_creacion_reporte where propietario_id='${owner}';
      delete from public.moderacion_imagenes where propietario_id='${owner}';
      delete from public.reportes where usuario_id='${owner}';
      delete from public.profiles where id='${owner}';
      delete from auth.users where id='${owner}';
      commit;`);
    await check(`select not exists(select 1 from auth.users where id='${owner}')
      and not exists(select 1 from public.reportes where usuario_id='${owner}');`);
    console.log('OK cleanup: synthetic owner and all reports absent');
  }
  for (const s of sessions) s.close();
}
