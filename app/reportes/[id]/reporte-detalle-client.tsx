"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  Calendar,
  Flag,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  CheckCircle2,
  Clock,
  Shield,
  Share2,
  Settings,
  Users,
  FileSearch2,
} from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import dynamic from "next/dynamic";
import { MapLoadingSkeleton } from "@/components/loading-skeletons";
import { PageTitleBar } from "@/components/page-title-bar";
import { toast } from "sonner";
import type { Comentario, ReporteDetalle } from "@/database/queries/reportes/[id]/index";
import type { Estado } from "@/database/queries/admin/index";
import type { GestionOperativaDetalle } from "@/lib/use-cases/cuadrillas/detalle-operativo";
import type { UsuarioActual } from "@/components/report-detail/comments-section";
import { getStatusVariant, getPriorityVariant, getPriorityIcon, getStatusIcon, getCategoryIcon } from "@/components/report-card";
import { PUNTOS } from "@/database/queries/puntos";
import { REPORT_STATE_IDS } from "@/lib/authz/catalog";
import { getNameFromRelation, getUserInitials, getUsernameFromRelation } from "@/lib/identity/display";
import { ChipEstadoOperativo } from "@/components/cuadrillas/chip-estado-operativo";
import { LineaTiempoOperativa } from "@/components/cuadrillas/linea-tiempo-operativa";
import { CommentsSection } from "@/components/report-detail/comments-section";
import { buildReportShareData, shareReport } from "@/lib/share/share-report";
import {
  cambiarEstadoAdminAction,
  crearComentarioAction,
  eliminarComentarioAdminAction,
  eliminarComentarioPropioAction,
  eliminarReporteAdminAction,
  eliminarReportePropioAction,
  votarNoExisteAction,
  votarReparadoAction,
} from "./actions";

dayjs.extend(utc);
dayjs.extend(timezone);

// Importar el MiniMap de forma dinámica solo en el cliente para evitar errores de SSR con Leaflet
const MiniMap = dynamic(() => import("@/components/mini-map").then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

/**
 * `reportes.created_at` is a timestamp without time zone. Browsers parse such strings as local
 * time, so the page has always shown them as Argentine wall-clock time. Reading them as UTC-3
 * (Argentina has no daylight saving) gives that same result on the server and in any browser,
 * so the server HTML matches the hydrated page. Strings that carry an offset keep it.
 */
function parseFechaReporte(fecha: string) {
  return /(Z|[+-]\d{2}(:?\d{2})?)$/.test(fecha) ? new Date(fecha) : new Date(`${fecha}-03:00`);
}

function formatRepairDuration(createdAt: string, repairedAt: string) {
  const durationInMinutes = Math.max(
    0,
    Math.floor((new Date(repairedAt).getTime() - parseFechaReporte(createdAt).getTime()) / 60000),
  );
  const days = Math.floor(durationInMinutes / (60 * 24));

  return days > 0 ? `${days} ${days === 1 ? "día" : "días"}` : "menos de 1 día";
}

/** Datos del detalle que la página carga en el servidor antes de renderizar. */
export type ReporteDetalleInicial = {
  reporte: ReporteDetalle | null;
  fotografiaPendiente?: boolean;
  currentUser: UsuarioActual | null;
  isAdmin: boolean;
  estados: Estado[];
  comentarios: Comentario[];
  historialEstados: Array<{
    id: number;
    reporte_id: number;
    estado_nuevo_id: number;
    created_at: string;
    comentario: string | null;
    estado_nuevo?: { id: number; nombre: string } | { id: number; nombre: string }[] | null;
    usuario?: { username: string | null } | null;
  }>;
  fechaCambioEstado: string | null;
  gestionOperativa: GestionOperativaDetalle | null;
  /** Computed on the server from the visitor's role; the vote actions check it again. */
  puedeVotar: boolean;
};

/**
 * Detalle completo de un reporte: estado, prioridad, ubicación, descripción, imágenes,
 * comentarios y controles de interacción (votos, comentarios y herramientas de administrador).
 * Los datos llegan ya cargados desde la página del servidor; acá solo vive la interacción.
 */
export function ReporteDetalleClient({
  reporte,
  fotografiaPendiente = false,
  currentUser,
  isAdmin,
  estados,
  comentarios,
  historialEstados,
  fechaCambioEstado,
  gestionOperativa,
  puedeVotar,
}: ReporteDetalleInicial) {
  const [votosCount, setVotosCount] = useState(reporte?.votos.noExiste.count ?? 0);
  const [hasVoted, setHasVoted] = useState(reporte?.votos.noExiste.hasVoted ?? false);
  const [isVoting, setIsVoting] = useState(false);
  const [votosReparadoCount, setVotosReparadoCount] = useState(reporte?.votos.reparado.count ?? 0);
  const [hasVotedReparado, setHasVotedReparado] = useState(reporte?.votos.reparado.hasVoted ?? false);
  const [isVotingReparado, setIsVotingReparado] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState("");
  const [comentarioEstado, setComentarioEstado] = useState("");
  const [isChangingEstado, setIsChangingEstado] = useState(false);

  // Estados para controlar los AlertDialogs
  const [showDeleteReporteDialog, setShowDeleteReporteDialog] = useState(false);
  const [showVoteNoExisteDialog, setShowVoteNoExisteDialog] = useState(false);
  const [showVoteReparadoDialog, setShowVoteReparadoDialog] = useState(false);

  // Estados para controlar los AlertDialogs de Admin
  const [showAdminChangeEstadoDialog, setShowAdminChangeEstadoDialog] = useState(false);
  const [showAdminDeleteReporteDialog, setShowAdminDeleteReporteDialog] = useState(false);
  const [showAdminPanelDialog, setShowAdminPanelDialog] = useState(false);

  // IDs de estados según la base de datos: 1 = Pendiente, 2 = Reparado, 3 = Rechazado
  // Verificar si el reporte está cerrado (Reparado o Rechazado) usando IDs
  const isReporteCerrado = reporte && (
    reporte.estado_id === REPORT_STATE_IDS.REPARADO ||
    reporte.estado_id === REPORT_STATE_IDS.RECHAZADO
  );

  const handleVoteNoExiste = async () => {
    if (!currentUser || !reporte) return;
    setShowVoteNoExisteDialog(true);
  };

  const confirmVoteNoExiste = async () => {
    if (!currentUser || !reporte) return;

    setIsVoting(true);
    try {
      const result = await votarNoExisteAction(reporte.id);

      if (!result.success) {
        toast.error(result.error || "Error al registrar el voto");
        return;
      }

      const newVotosCount = result.data.count;
      setVotosCount(newVotosCount);
      setHasVoted(true);

      // Mostrar mensaje de puntos ganados
      toast.success(`¡Voto registrado! +${PUNTOS.VOTAR_NO_EXISTE} punto`, {
        description: "Tu voto ha sido contabilizado correctamente"
      });

    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar el voto", {
        description: "Por favor, intenta nuevamente"
      });
    } finally {
      setIsVoting(false);
      setShowVoteNoExisteDialog(false);
    }
  };

  const handleVoteReparado = async () => {
    if (!currentUser || !reporte) return;
    setShowVoteReparadoDialog(true);
  };

  const confirmVoteReparado = async () => {
    if (!currentUser || !reporte) return;

    setIsVotingReparado(true);
    try {
      const result = await votarReparadoAction(reporte.id);

      if (!result.success) {
        toast.error(result.error || "Error al registrar el voto");
        return;
      }

      const newVotosReparadoCount = result.data.count;
      setVotosReparadoCount(newVotosReparadoCount);
      setHasVotedReparado(true);

      // Mostrar mensaje de puntos ganados
      toast.success(`¡Voto registrado! +${PUNTOS.VOTAR_REPARADO} punto`, {
        description: "Gracias por mantener la información actualizada"
      });

      if (result.data.stateChangedTo) {
        toast.success("¡Reporte marcado como reparado!");
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar el voto", {
        description: "Por favor, intenta nuevamente"
      });
    } finally {
      setIsVotingReparado(false);
      setShowVoteReparadoDialog(false);
    }
  };

  const handleShareReport = async () => {
    if (!reporte) return;

    const outcome = await shareReport(buildReportShareData(reporte.titulo, `${window.location.origin}/reportes/${reporte.id}`), navigator);
    if (outcome === "copied") {
      toast.success("Enlace copiado", { description: "Ya podés compartir este reporte." });
    } else if (outcome === "failed") {
      toast.error("No se pudo compartir el reporte", { description: "Copiá la dirección desde el navegador." });
    }
  };

  const handleDeleteReporte = async () => {
    if (!currentUser || !reporte) return;
    setShowDeleteReporteDialog(true);
  };

  const confirmDeleteReporte = async () => {
    if (!currentUser || !reporte) return;

    setIsDeleting(true);
    try {
      const result = await eliminarReportePropioAction(reporte.id);

      if (!result.success) {
        toast.error("Error al eliminar el reporte", {
          description: result.error || "Por favor, intenta nuevamente."
        });
        return;
      }

      toast.success(`Reporte eliminado exitosamente`, {
        description: `${PUNTOS.ELIMINAR_REPORTE_PROPIO} puntos. Redirigiendo al dashboard...`
      });
      // Redirigir al dashboard
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar la eliminación", {
        description: "Por favor, intenta nuevamente"
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteReporteDialog(false);
    }
  };

  // ===== FUNCIONES DE ADMINISTRADOR =====
  const handleAdminChangeEstado = async () => {
    if (!currentUser || !reporte || !estadoSeleccionado) return;
    setShowAdminChangeEstadoDialog(true);
  };

  const confirmAdminChangeEstado = async () => {
    if (!currentUser || !reporte || !estadoSeleccionado) return;

    setIsChangingEstado(true);
    try {
      const result = await cambiarEstadoAdminAction(
        reporte.id,
        parseInt(estadoSeleccionado),
        comentarioEstado.trim() || undefined
      );

      if (!result.success) {
        toast.error("Error al cambiar el estado del reporte", {
          description: result.error || "Por favor, intenta nuevamente"
        });
        return;
      }

      toast.success("Estado actualizado exitosamente", {
        description: "El cambio ha sido registrado en el historial"
      });
      // Recargar la página para mostrar los cambios
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar el cambio de estado", {
        description: "Por favor, intenta nuevamente"
      });
    } finally {
      setIsChangingEstado(false);
      setShowAdminChangeEstadoDialog(false);
    }
  };

  const handleAdminDeleteReporte = async () => {
    if (!currentUser || !reporte) return;
    setShowAdminDeleteReporteDialog(true);
  };

  const confirmAdminDeleteReporte = async () => {
    if (!currentUser || !reporte) return;

    try {
      const result = await eliminarReporteAdminAction(reporte.id);

      if (!result.success) {
        toast.error("Error al eliminar el reporte", {
          description: result.error || "Por favor, intenta nuevamente"
        });
        return;
      }

      toast.success("Reporte eliminado exitosamente", {
        description: "Redirigiendo..."
      });
      // Redirigir al dashboard
      setTimeout(() => window.location.href = "/reportes", 1000);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar la eliminación", {
        description: "Por favor, intenta nuevamente"
      });
    } finally {
      setShowAdminDeleteReporteDialog(false);
    }
  };

  if (!reporte) {
    return (
      <div className="page-shell flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Reporte no encontrado</p>
          <Button asChild className="mt-4">
            <Link href="/reportes">Volver a Reportes</Link>
          </Button>
        </div>
      </div>
    );
  }

  const tiempoReparacion = fechaCambioEstado && reporte.estado_id === REPORT_STATE_IDS.REPARADO
    ? formatRepairDuration(reporte.created_at, fechaCambioEstado)
    : null;
  const showVoteFooter = Boolean(
    isReporteCerrado ||
    currentUser?.id === reporte.usuario_id ||
    (!isAdmin && (!currentUser || puedeVotar))
  );

  return (
    <div className="page-shell">
      <div className="page-container space-y-4 md:space-y-6 lg:space-y-8">
        <section className="space-y-3">
          <PageTitleBar
            icon={<FileSearch2 className="size-4" />}
            title="Detalle del reporte"
            description="Consultá el estado y los avances del reporte."
          />
        </section>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Contenido Principal */}
          <div className="space-y-4 lg:col-span-8">
            {/* Encabezado del Reporte */}
            <Card className="gap-0">
              <CardHeader className="pb-3">
                <div className="flex w-full flex-wrap items-center gap-1.5">
                  <Badge
                    variant={getPriorityVariant(getNameFromRelation(reporte.prioridades))}
                    className="flex items-center gap-1 text-xs"
                  >
                    {getPriorityIcon(getNameFromRelation(reporte.prioridades), "size-3")}
                    {getNameFromRelation(reporte.prioridades)}
                  </Badge>
                  <Badge
                    variant={getStatusVariant(getNameFromRelation(reporte.estados))}
                    className="flex items-center gap-1 text-xs"
                  >
                    {getStatusIcon(getNameFromRelation(reporte.estados), "size-3")}
                    {getNameFromRelation(reporte.estados)}
                  </Badge>
                  <Badge variant="category" className="flex items-center gap-1 text-xs">
                    {getCategoryIcon(getNameFromRelation(reporte.categorias), "size-3")}
                    {getNameFromRelation(reporte.categorias)}
                  </Badge>
                </div>
                <div className="flex min-w-0 items-start gap-3">
                  <CardTitle className="min-w-0 flex-1 break-words text-xl font-bold tracking-tight md:text-2xl">{reporte.titulo}</CardTitle>
                  <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={handleShareReport}
                    aria-label="Compartir reporte"
                    title="Compartir reporte"
                  >
                    <Share2 className="size-4" />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="border-[var(--semantic-admin)]/40 text-[var(--semantic-admin)] hover:bg-[var(--semantic-admin)]/10 hover:text-[var(--semantic-admin)]"
                      onClick={() => setShowAdminPanelDialog(true)}
                      aria-label="Abrir herramientas de administrador"
                      title="Herramientas de administrador"
                    >
                      <Shield className="size-4" />
                    </Button>
                  )}

                  {currentUser && !isAdmin && currentUser.id === reporte.usuario_id && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="size-8"
                      onClick={handleDeleteReporte}
                      disabled={isDeleting}
                      aria-label={isDeleting ? "Eliminando reporte" : "Eliminar reporte"}
                      title="Eliminar reporte"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="mb-4 text-sm leading-relaxed text-foreground md:text-base">
                  {reporte.descripcion}
                </p>

                {fotografiaPendiente && (
                  <p role="status" className="mb-4 rounded-lg border border-amber-600/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-foreground">
                    Fotografía pendiente de revisión
                  </p>
                )}

                {/* Imágenes */}
                {reporte.fotos_reporte && reporte.fotos_reporte.length > 0 && (
                  <div className="flex justify-center mb-4 md:mb-6 lg:mb-8">
                    {reporte.fotos_reporte.map((foto, index) => (
                      <div
                        key={index}
                        className="flex aspect-video w-full max-w-2xl items-center justify-center overflow-hidden rounded-md bg-[var(--surface-subtle)] md:rounded-lg lg:rounded-xl"
                      >
                        <img
                          src={foto.publicUrl || foto.url || "/placeholder.svg"}
                          alt={`Imagen ${index + 1} del reporte`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Autor y Fecha */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">
                        {getUserInitials(getUsernameFromRelation(reporte.profiles))}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">Reportado por {getUsernameFromRelation(reporte.profiles)}</span>
                  </div>
                 <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 shrink-0" />
                    <span className="whitespace-nowrap">
                      {parseFechaReporte(reporte.created_at).toLocaleDateString("es-AR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: ZONA_HORARIA,
                     })}
                   </span>
                 </div>
               </div>
                {fechaCambioEstado && isReporteCerrado && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium ${getNameFromRelation(reporte.estados).toLowerCase() === 'reparado'
                    ? 'tone-success-inline'
                    : 'tone-danger-inline'
                  }`}>
                    <Clock className="size-3.5 shrink-0" />
                    <span className="flex flex-col">
                      <span>
                        {getNameFromRelation(reporte.estados)} el{" "}
                        {dayjs
                          .utc(fechaCambioEstado)
                          .tz("America/Argentina/Buenos_Aires")
                          .format("DD/MM/YYYY [a las] HH:mm")}
                      </span>
                      {tiempoReparacion && (
                        <span className="border-t border-current/20">
                          Arreglado en {tiempoReparacion}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {showVoteFooter && (
                  <div className="mt-3">
                    <hr className="mb-2 border-border" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {currentUser && puedeVotar && !isReporteCerrado && (
                        <div role="group" aria-label="Votar sobre el reporte" className="grid w-full grid-cols-2 gap-2">
                          <Button
                            variant="default"
                            size="xs"
                            className={`min-h-7 w-full px-2.5 text-[11px] ${currentUser.id === reporte.usuario_id ? "col-span-2" : ""}`}
                            onClick={handleVoteReparado}
                            disabled={hasVotedReparado || isVotingReparado}
                          >
                            <ThumbsUp className="size-3" />
                            Reparado
                          </Button>
                          {currentUser.id !== reporte.usuario_id && (
                            <Button
                              variant="destructive"
                              size="xs"
                              className="min-h-7 w-full px-2.5 text-[11px]"
                              onClick={handleVoteNoExiste}
                              disabled={hasVoted || isVoting}
                            >
                              <ThumbsDown className="size-3" />
                              No existe
                            </Button>
                          )}
                        </div>
                      )}
                      {!currentUser && !isReporteCerrado && (
                        <Button asChild variant="outline" size="xs" className="min-h-7 px-2.5 text-[11px]">
                          <Link href={`/auth?next=/reportes/${reporte.id}`}>Entrar para votar</Link>
                        </Button>
                      )}
                      {isReporteCerrado && (
                        <span className="text-xs text-muted-foreground">
                          Reparado {votosReparadoCount} · No existe {votosCount}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <CommentsSection
              comments={comentarios}
              statusHistory={historialEstados}
              currentUser={currentUser}
              reportOwnerId={reporte.usuario_id}
              isAdmin={isAdmin}
              isClosed={Boolean(isReporteCerrado)}
              onSubmitComment={(content) => crearComentarioAction(reporte.id, content)}
              onDeleteComment={async (commentId) => {
                const result = await eliminarComentarioPropioAction(commentId)
                return result.success ? { success: true } : { success: false, error: String(result.error || "") }
              }}
              onAdminDeleteComment={async (commentId) => {
                const result = await eliminarComentarioAdminAction(commentId)
                return result.success ? { success: true } : { success: false, error: String(result.error || "") }
              }}
            />
          </div>

          {/* Barra Lateral */}
          <div className="lg:col-span-4 space-y-4 md:space-y-6">

            {/* Seguimiento de la cuadrilla (cuadrillas) - solo lectura; la gestión vive en /dashboard/cuadrillas */}
            {gestionOperativa &&
              (gestionOperativa.puedeOperar ||
                gestionOperativa.estadoOperativo !== null ||
                gestionOperativa.eventos.length > 0) && (
                <Card className="gap-0">
                  <CardHeader className="gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="size-5 text-muted-foreground md:size-6" />
                      <CardTitle className="text-lg font-semibold tracking-tight">Seguimiento de la cuadrilla</CardTitle>
                    </div>
                    <CardDescription className="text-sm leading-6">
                      {gestionOperativa.puedeOperar
                        ? "Estado de la cuadrilla asignada y su historial de intervención en este reporte"
                        : "Seguimiento de la cuadrilla asignada a este reporte"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="section-stack">
                    <div>
                      {gestionOperativa.estadoOperativo ? (
                        <ChipEstadoOperativo
                          estadoOperativo={gestionOperativa.estadoOperativo}
                          cuadrillaNombre={gestionOperativa.cuadrillaNombre}
                        />
                      ) : (
                        gestionOperativa.puedeOperar && (
                          <p className="text-sm text-muted-foreground">Sin cuadrilla asignada</p>
                        )
                      )}
                    </div>

                    <div className="pt-2">
                      <LineaTiempoOperativa
                        eventos={gestionOperativa.eventos}
                        mostrarInternas={gestionOperativa.puedeOperar}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Marcador de Posición del Mapa */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg">Ubicación</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Link href="/mapa" className="block group">
                  <div className="group relative aspect-square overflow-hidden rounded-md border shadow-sm transition-all group-hover:shadow-md md:rounded-lg">
                    {reporte.lat !== null && reporte.lon !== null ? (
                      <MiniMap lat={reporte.lat} lon={reporte.lon} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
                        Ubicación no disponible
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-x-2 bottom-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur-sm md:inset-x-3 md:bottom-3">
                      <div className="flex items-center gap-2 text-xs text-foreground">
                        <MapPin className="size-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">Ver en mapa completo</p>
                          {reporte.lat === null || reporte.lon === null ? (
                            <p className="truncate text-xs text-muted-foreground">Ubicación no disponible</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {isAdmin && (
        <Dialog open={showAdminPanelDialog} onOpenChange={setShowAdminPanelDialog}>
          <DialogContent>
            <DialogHeader className="pr-8">
              <DialogTitle className="flex items-center gap-2 text-[var(--semantic-admin)]">
                <Shield className="size-5" />
                Panel de Administrador
              </DialogTitle>
              <DialogDescription>
                Controles exclusivos para gestionar este reporte
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 rounded-xl border border-border p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Cambiar Estado</label>
                <Select value={estadoSeleccionado} onValueChange={setEstadoSeleccionado}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="Seleccionar estado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((estado) => (
                      <SelectItem key={estado.id} value={estado.id.toString()}>
                        {estado.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Descripción del cambio (opcional)"
                  value={comentarioEstado}
                  onChange={(e) => setComentarioEstado(e.target.value)}
                  className="min-h-[60px] resize-none text-sm"
                />
                <Button
                  onClick={handleAdminChangeEstado}
                  disabled={!estadoSeleccionado || isChangingEstado}
                  className="w-full text-sm"
                  size="sm"
                >
                  <Settings className="size-4" />
                  {isChangingEstado ? "Actualizando..." : "Actualizar Estado"}
                </Button>
              </div>
              <div className="border-t border-border pt-3">
                <Button
                  onClick={handleAdminDeleteReporte}
                  variant="destructive"
                  className="w-full text-sm"
                  size="sm"
                >
                  <Trash2 className="size-4" />
                  Eliminar Reporte (Admin)
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* AlertDialog - Eliminar Reporte */}
      <AlertDialog open={showDeleteReporteDialog} onOpenChange={setShowDeleteReporteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-4" aria-hidden="true" />
              </span>
              ¿Eliminar este reporte?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Se eliminará permanentemente este reporte.</p>
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="font-semibold text-foreground">{reporte?.titulo}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{reporte?.descripcion}</p>
                </div>
                <p className="text-sm font-medium text-destructive">
                  Esta acción no se puede deshacer.
                </p>
                <p className="text-xs text-muted-foreground">
                  Perderás <span className="font-bold text-destructive">{PUNTOS.ELIMINAR_REPORTE_PROPIO} puntos</span> al eliminar este reporte.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteReporte}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <div className="w-4 h-4 border-2 border-destructive-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Reporte
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog - Votar No Existe */}
      <AlertDialog open={showVoteNoExisteDialog} onOpenChange={setShowVoteNoExisteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <ThumbsDown className="size-4" aria-hidden="true" />
              </span>
              ¿Confirmar voto «No existe»?
            </AlertDialogTitle>
            <AlertDialogDescription>Tu voto sumará 1 punto.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVoting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoteNoExiste}
              disabled={isVoting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isVoting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Votando...
                </>
              ) : (
                <>
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Confirmar Voto
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog - Votar Reparado */}
      <AlertDialog open={showVoteReparadoDialog} onOpenChange={setShowVoteReparadoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
              ¿Confirmar que está reparado?
            </AlertDialogTitle>
            <AlertDialogDescription>Tu voto sumará 1 punto.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isVotingReparado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoteReparado}
              disabled={isVotingReparado}
            >
              {isVotingReparado ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Votando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Confirmar Voto
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog - Admin: Cambiar Estado */}
      <AlertDialog open={showAdminChangeEstadoDialog} onOpenChange={setShowAdminChangeEstadoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--semantic-admin)]/10 text-[var(--semantic-admin)]">
                <Shield className="size-4" aria-hidden="true" />
              </span>
              ¿Cambiar estado del reporte?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Elegí el nuevo estado para este reporte.</p>
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="font-semibold text-foreground">{reporte?.titulo}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Estado actual:</span>
                    <Badge variant={getStatusVariant(getNameFromRelation(reporte?.estados))}>
                      {getNameFromRelation(reporte?.estados)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Nuevo estado:</span>
                    <Badge
                      variant={getStatusVariant(
                        estados.find(e => e.id.toString() === estadoSeleccionado)?.nombre || ""
                      )}
                    >
                      {estados.find(e => e.id.toString() === estadoSeleccionado)?.nombre || "N/A"}
                    </Badge>
                  </div>
                  {comentarioEstado.trim() && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Descripción:</p>
                      <p className="text-sm text-foreground">{comentarioEstado}</p>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-[var(--semantic-admin)]/25 bg-[var(--semantic-admin)]/10 p-3 text-[var(--semantic-admin)]">
                  <p className="text-sm">
                    Esta acción quedará registrada en el historial del reporte.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingEstado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAdminChangeEstado}
              disabled={isChangingEstado}
                className="bg-foreground text-background hover:bg-foreground/88"
            >
              {isChangingEstado ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Actualizando...
                </>
              ) : (
                <>
                  <Settings className="w-4 h-4 mr-2" />
                  Confirmar Cambio
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog - Admin: Eliminar Reporte */}
      <AlertDialog open={showAdminDeleteReporteDialog} onOpenChange={setShowAdminDeleteReporteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--semantic-admin)]/10 text-[var(--semantic-admin)]">
                <Shield className="size-4" aria-hidden="true" />
              </span>
              ¿Eliminar reporte como administrador?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Se eliminará permanentemente este reporte y sus comentarios.</p>
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="font-semibold text-foreground">{reporte?.titulo}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{reporte?.descripcion}</p>
                  <div className="flex items-center gap-2 text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Estado actual:</span>
                    <Badge variant={getStatusVariant(getNameFromRelation(reporte?.estados))}>
                      {getNameFromRelation(reporte?.estados)}
                    </Badge>
                  </div>
                </div>
                <div className="tone-danger-soft-inline rounded-xl p-3">
                  <p className="text-sm font-medium">
                    Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAdminDeleteReporte}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar Reporte (Admin)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
