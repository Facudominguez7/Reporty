import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getReporteSeo } from "@/database/queries/reportes/seo";
import { buildReportMetadata } from "@/lib/seo/report-metadata";
import {
  getReporteDetalle,
  getComentariosReporte,
  getHistorialEstados,
  getNumeroReclamoDefensoria,
} from "@/database/queries/reportes/[id]/index";
import { getEstados } from "@/database/queries/admin/index"
import { getCategorias, getPrioridades } from "@/database/queries/reportes/nuevo";
import { REPORT_STATE_IDS, ROLE_IDS } from "@/lib/authz/catalog";
import { esDefensoria, getUserRoleContext, puedeOperarCuadrillas, puedeVotarReportes } from "@/lib/authz/roles";
import { obtenerUsuarioDeLectura, sesionVigenteEnAuth } from "@/lib/auth/usuario-de-lectura";
import { cuadrillasHabilitadas } from "@/lib/features";
import { estadoFotografias, tieneRevisionRechazoPendiente } from "@/lib/moderation/estado-publico.server";
import { obtenerSeccionReparacion } from "@/lib/use-cases/reportes/evidencia-reparacion-detalle.server";
import { obtenerGestionOperativaDetalle } from "@/lib/use-cases/cuadrillas/detalle-operativo";
import { ReporteDetalleClient, type ReporteDetalleInicial } from "./reporte-detalle-client";

const SIN_REPORTE: ReporteDetalleInicial = {
  reporte: null,
  puedeContactar: false,
  currentUser: null,
  isAdmin: false,
  estados: [],
  categoriasDisponibles: [],
  prioridadesDisponibles: [],
  comentarios: [],
  historialEstados: [],
  fechaCambioEstado: null,
  gestionOperativa: null,
  puedeVotar: false,
  esDefensoria: false,
  numeroReclamoDefensoria: null,
  evidenciaReparacion: null,
};

function parseReporteId(id: string) {
  if (!/^\d+$/.test(id)) return null;
  const numero = Number(id);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Loads everything the detail page renders, on the server and with the visitor's session, so
 * the data arrives in the HTML. Any unexpected failure renders "Reporte no encontrado", like the
 * former client-side load did.
 */
async function cargarDetalle(id: string): Promise<ReporteDetalleInicial> {
  try {
    const supabase = await createClient();
    const reporteIdNumerico = parseReporteId(id);

    // Loads that only need the report id start right away, at the same time as the user lookup.
    // The user comes from the verified token claims, without a trip to Supabase Auth (#310).
    const userPromise = obtenerUsuarioDeLectura(supabase);
    const usuarioIdPromise = userPromise.then((user) => user?.id ?? null);
    const comentariosPromise = getComentariosReporte(supabase, id);
    const historialPromise = getHistorialEstados(supabase, id);
    // The report row does not wait for the session: only its vote-presence lookup needs the user.
    const reportePromise = getReporteDetalle(supabase, id, usuarioIdPromise);
    // Moderation and the rejection review only need the id, so they start now too. Their result is
    // used only if the report exists, and the review only while the report is open. Both photo
    // states come from one query: a Worker lets only six requests wait for headers at a time, and
    // this page already starts six.
    const moderacionPromise =
      reporteIdNumerico !== null
        ? Promise.all([estadoFotografias(reporteIdNumerico), tieneRevisionRechazoPendiente(reporteIdNumerico)]).then(
            ([fotografias, revision]) => [fotografias.pendiente, fotografias.aprobada, revision] as const,
          )
        : Promise.resolve([false, false, false] as const);
    // The role is read once per request, from the server session, and shared by voting, the admin
    // tools, the crew panel and the repair section. A failed lookup means "no role": the vote
    // buttons and admin tools hide, and the report still renders.
    const rolIdPromise = userPromise.then(async (user) => {
      if (!user) return null;
      const { data: contextoRol, error: rolError } = await getUserRoleContext(supabase, user.id);
      if (rolError) console.error("Error al cargar el rol del visitante:", rolError);
      return contextoRol?.roleId ?? null;
    }).catch((rolError) => {
      console.error("Error al cargar el rol del visitante:", rolError);
      return null;
    });
    // Fail closed: if the role could not be read, the vote buttons stay hidden. Every profile has a
    // role (rol_id defaults to Ciudadano), so a null role here means the lookup failed.
    const rolesVisitantePromise = Promise.all([userPromise, rolIdPromise]).then(([user, rolId]) => ({
      puedeVotar: user && rolId !== null ? puedeVotarReportes(user, rolId) : false,
      esDefensoria: esDefensoria(rolId),
    }));
    // A failed management load must only hide the operational panel, never the report itself,
    // so its rejection resolves to null here. While crews are turned off there is no panel to load.
    const gestionPromise =
      cuadrillasHabilitadas() && reporteIdNumerico !== null
        ? Promise.all([userPromise, rolIdPromise])
            .then(async ([user, rolId]) => {
              // Crew staff read internal data with the service client, so their session is confirmed
              // with Supabase Auth first: a revoked staff session must not keep seeing it (#310, S4).
              const vigente = user && puedeOperarCuadrillas(rolId) ? await sesionVigenteEnAuth(supabase, user.id) : true;
              return obtenerGestionOperativaDetalle(
                supabase,
                vigente ? user?.id ?? null : null,
                reporteIdNumerico,
                vigente ? rolId : null,
              );
            })
            .catch((gestionError) => {
              console.error("Error al cargar la gestión operativa:", gestionError);
              return null;
            })
        : null;
    // The admin tools need the edit options; the lookups are only read for admins.
    const adminPromise = rolIdPromise.then(async (rolId) => {
      const isAdmin = rolId === ROLE_IDS.ADMIN;
      if (!isAdmin) return { isAdmin, estados: [], categoriasDisponibles: [], prioridadesDisponibles: [] };
      const [estados, categoriasDisponibles, prioridadesDisponibles] = await Promise.all([
        getEstados(supabase), getCategorias(supabase), getPrioridades(supabase),
      ]);
      return { isAdmin, estados: estados.data, categoriasDisponibles, prioridadesDisponibles };
    });
    // These may settle while another load is still pending. A no-op handler avoids an
    // "unhandled rejection" in that window; Promise.all below still rethrows into the catch.
    for (const pending of [comentariosPromise, historialPromise, reportePromise, moderacionPromise, adminPromise]) {
      pending.catch(() => {});
    }

    const [
      user,
      rolId,
      { data: reporte, error },
      adminResult,
      { data: comentarios },
      { data: historial },
      gestionOperativa,
      rolesVisitante,
    ] = await Promise.all([
      userPromise,
      rolIdPromise,
      reportePromise,
      adminPromise,
      comentariosPromise,
      historialPromise,
      gestionPromise,
      rolesVisitantePromise,
    ]);

    const encontrado = !error && reporte ? reporte : null;
    // En la ficha pública, solo el autor recibe el número; Defensoría lo gestiona en su panel.
    const esAutor = Boolean(encontrado && user && encontrado.usuario_id === user.id);

    const cerrado =
      encontrado?.estado_id === REPORT_STATE_IDS.REPARADO || encontrado?.estado_id === REPORT_STATE_IDS.RECHAZADO;
    // When the report closed: the first history entry that moved it to Reparado or Rechazado.
    const cambio = cerrado
      ? historial?.find(
          (h) => h.estado_nuevo_id === REPORT_STATE_IDS.REPARADO || h.estado_nuevo_id === REPORT_STATE_IDS.RECHAZADO,
        )
      : undefined;

    const [[fotografiaPendiente, fotografiaAprobada, revisionEncontrada], evidenciaReparacion, numeroReclamoDefensoria] = encontrado
      ? await Promise.all([
          moderacionPromise,
          // La evidencia de reparación nunca rompe la ficha: si su lectura falla, la
          // sección desaparece y el reporte sigue renderizado.
          obtenerSeccionReparacion(encontrado.id, encontrado.estado_id, encontrado.usuario_id ?? null, {
            usuario: user,
            rolId,
          }).catch((evidenciaError) => {
            console.error("Error al cargar la evidencia de reparación:", evidenciaError)
            return null
          }),
          encontrado.estado_id !== REPORT_STATE_IDS.PENDIENTE && esAutor
            ? getNumeroReclamoDefensoria(supabase, encontrado.id)
            : null,
        ])
      : [[false, false, false] as const, null, null];
    // Solo un reporte abierto puede estar en revisión de rechazo.
    const revisionRechazoPendiente = cerrado ? false : revisionEncontrada;

    return {
      reporte: encontrado,
      fotografiaPendiente,
      revisionRechazoPendiente,
      puedeContactar: Boolean(encontrado && fotografiaAprobada),
      currentUser: user ? { id: user.id, is_anonymous: user.is_anonymous } : null,
      isAdmin: adminResult?.isAdmin ?? false,
      estados: adminResult?.isAdmin ? adminResult.estados : [],
      categoriasDisponibles: adminResult?.isAdmin ? adminResult.categoriasDisponibles : [],
      prioridadesDisponibles: adminResult?.isAdmin ? adminResult.prioridadesDisponibles : [],
      comentarios,
      historialEstados: historial ?? [],
      fechaCambioEstado: cambio?.created_at ?? null,
      gestionOperativa: encontrado ? gestionOperativa : null,
      puedeVotar: rolesVisitante.puedeVotar,
      esDefensoria: rolesVisitante.esDefensoria,
      numeroReclamoDefensoria,
      evidenciaReparacion,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching data:", error);
    return SIN_REPORTE;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { reporte, error } = await getReporteSeo(id);

  // A failed lookup keeps the site-wide defaults instead of marking a real report as missing.
  if (error) {
    console.error("Error al cargar la metadata del reporte:", error);
    return {};
  }
  return buildReportMetadata(reporte);
}

/**
 * Página que muestra el detalle completo de un reporte: estado, prioridad, ubicación, descripción, imágenes, comentarios y controles de interacción.
 *
 * @param params - Objeto con la propiedad `id` (cadena) del reporte a mostrar; se recibe como Promise y se resuelve en el servidor.
 * @returns El detalle del reporte renderizado en el servidor, con sus interacciones (votos, comentarios y controles administrativos) en el cliente.
 */
export default async function ReporteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detalle = await cargarDetalle(id);

  return <ReporteDetalleClient key={`${id}-${detalle.isAdmin ? "admin" : "viewer"}`} {...detalle} />;
}
