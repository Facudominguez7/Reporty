import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getReporteSeo } from "@/database/queries/reportes/seo";
import { buildReportMetadata } from "@/lib/seo/report-metadata";
import {
  getReporteDetalle,
  getComentariosReporte,
  getHistorialEstados,
} from "@/database/queries/reportes/[id]/index";
import { verificarEsAdmin, getEstados } from "@/database/queries/admin/index";
import { REPORT_STATE_IDS } from "@/lib/authz/catalog";
import { getUserRoleContext, puedeVotarReportes } from "@/lib/authz/roles";
import { cuadrillasHabilitadas } from "@/lib/features";
import { tieneFotografiaAprobada, tieneFotografiaPendiente } from "@/lib/moderation/estado-publico.server";
import { obtenerGestionOperativaDetalle } from "@/lib/use-cases/cuadrillas/detalle-operativo";
import { ReporteDetalleClient, type ReporteDetalleInicial } from "./reporte-detalle-client";

const SIN_REPORTE: ReporteDetalleInicial = {
  reporte: null,
  puedeContactar: false,
  currentUser: null,
  isAdmin: false,
  estados: [],
  comentarios: [],
  historialEstados: [],
  fechaCambioEstado: null,
  gestionOperativa: null,
  puedeVotar: false,
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
    const userPromise = supabase.auth.getUser().then(({ data }) => data.user);
    const comentariosPromise = getComentariosReporte(supabase, id);
    const historialPromise = getHistorialEstados(supabase, id);
    // Voting depends only on who the visitor is, never on the crew panel loading. A failed role
    // lookup hides the vote buttons but still renders the report.
    const puedeVotarPromise = userPromise
      .then(async (user) => {
        if (!user) return false;
        const { data: contextoRol } = await getUserRoleContext(supabase, user.id);
        return puedeVotarReportes(user, contextoRol?.roleId);
      })
      .catch((rolError) => {
        console.error("Error al cargar el rol para votar:", rolError);
        return false;
      });
    // A failed management load must only hide the operational panel, never the report itself,
    // so its rejection resolves to null here. The role it reads comes from the server session.
    // While crews are turned off there is no panel to load.
    const gestionPromise =
      cuadrillasHabilitadas() && reporteIdNumerico !== null
        ? userPromise
            .then((user) => obtenerGestionOperativaDetalle(supabase, user?.id ?? null, reporteIdNumerico))
            .catch((gestionError) => {
              console.error("Error al cargar la gestión operativa:", gestionError);
              return null;
            })
        : null;
    // These settle while the user lookup is still pending. A no-op handler avoids an
    // "unhandled rejection" in that window; Promise.all below still rethrows into the catch.
    for (const pending of [comentariosPromise, historialPromise]) {
      pending.catch(() => {});
    }

    const user = await userPromise;

    // The admin check and the report detail both need the user, but not each other.
    const adminPromise = user
      ? verificarEsAdmin(supabase, user.id).then(async ({ isAdmin }) => ({
          isAdmin,
          estados: isAdmin ? (await getEstados(supabase)).data : [],
        }))
      : null;

    const [
      { data: reporte, error },
      adminResult,
      { data: comentarios },
      { data: historial },
      gestionOperativa,
      puedeVotar,
    ] = await Promise.all([
      getReporteDetalle(supabase, id, user?.id),
      adminPromise,
      comentariosPromise,
      historialPromise,
      gestionPromise,
      puedeVotarPromise,
    ]);

    const encontrado = !error && reporte ? reporte : null;
    const cerrado =
      encontrado?.estado_id === REPORT_STATE_IDS.REPARADO || encontrado?.estado_id === REPORT_STATE_IDS.RECHAZADO;
    // When the report closed: the first history entry that moved it to Reparado or Rechazado.
    const cambio = cerrado
      ? historial?.find(
          (h) => h.estado_nuevo_id === REPORT_STATE_IDS.REPARADO || h.estado_nuevo_id === REPORT_STATE_IDS.RECHAZADO,
        )
      : undefined;

    const [fotografiaPendiente, fotografiaAprobada] = encontrado
      ? await Promise.all([
          tieneFotografiaPendiente(encontrado.id),
          tieneFotografiaAprobada(encontrado.id),
        ])
      : [false, false]

    return {
      reporte: encontrado,
      fotografiaPendiente,
      puedeContactar: Boolean(encontrado && fotografiaAprobada),
      currentUser: user ? { id: user.id, is_anonymous: user.is_anonymous } : null,
      isAdmin: adminResult?.isAdmin ?? false,
      estados: adminResult?.isAdmin ? adminResult.estados : [],
      comentarios,
      historialEstados: historial ?? [],
      fechaCambioEstado: cambio?.created_at ?? null,
      gestionOperativa: encontrado ? gestionOperativa : null,
      puedeVotar,
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

  return <ReporteDetalleClient key={id} {...detalle} />;
}
