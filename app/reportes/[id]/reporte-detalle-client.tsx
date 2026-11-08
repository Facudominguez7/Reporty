"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  MapPin,
  Pencil,
  Calendar,
  Flag,
  ThumbsDown,
  Trash2,
  CheckCircle2,
  Clock,
  Shield,
  Share2,
  Users,
  FileSearch2,
  X,
} from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
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
import { optimizeReportImage } from "@/lib/media/optimize-report-image";
import { REPORT_STATE_IDS } from "@/lib/authz/catalog";
import { getNameFromRelation, getUserInitials, getUsernameFromRelation } from "@/lib/identity/display";
import { ChipEstadoOperativo } from "@/components/cuadrillas/chip-estado-operativo";
import { LineaTiempoOperativa } from "@/components/cuadrillas/linea-tiempo-operativa";
import { CommentsSection } from "@/components/report-detail/comments-section";
import {
  ResumenReparacion,
  EvidenciaReparacion,
  type AccionesEvidenciaReparacion,
  type ResultadoAccionReparacion,
} from "@/components/report-detail/evidencia-reparacion";
import {
  AccionesFlotantes,
  accionesDisponibles,
  construirAccionesFlotantes,
  type ClaveAccionFlotante,
  type ContextoAccionesFlotantes,
} from "@/components/report-detail/acciones-flotantes";
import { HojaReporte } from "@/components/report-detail/hojas-reporte";
import { ContenidoUbicacion, FranjaUbicacion } from "@/components/report-detail/ubicacion-reporte";
import type { SeccionReparacionVista } from "@/lib/use-cases/reportes/evidencia-reparacion-detalle.server";
import { AdminInlineField, AdminReportEditActions, AdminReportPhotoControls, type AdminReportPhotoDraft } from "./admin-report-editor";
import { ReportContactActions, ReportContactDialog, CONTACT_DISCLAIMER } from "@/components/report-contact-actions";
import { buildReportShareData, shareReport } from "@/lib/share/share-report";
import {
  actualizarReporteAdminAction,
  cambiarEstadoAdminAction,
  confirmarReparacionAction,
  crearComentarioAction,
  impugnarReparacionAction,
  informarReparacionAction,
  quitarFotoReporteAdminAction,
  reemplazarFotoReporteAdminAction,
  eliminarComentarioAdminAction,
  eliminarComentarioPropioAction,
  eliminarReporteAdminAction,
  eliminarReportePropioAction,
  votarNoExisteAction,
} from "./actions";

dayjs.extend(utc);
dayjs.extend(timezone);

// Importar el MiniMap de forma dinámica solo en el cliente para evitar errores de SSR con Leaflet
const MiniMap = dynamic(() => import("@/components/mini-map").then((m) => m.MiniMap), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});
const LocationPickerMap = dynamic(() => import("@/components/location-picker-map").then((m) => m.LocationPickerMap), {
  ssr: false,
  loading: () => <div className="h-48 w-full"><MapLoadingSkeleton /></div>,
});

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

type AdminReportDraft = {
  titulo: string;
  descripcion: string;
  categoriaId: number | null;
  prioridadId: number | null;
  estadoId: number;
  comentarioEstado: string;
  lat: number | null;
  lon: number | null;
};

function createAdminReportDraft(reporte: ReporteDetalle): AdminReportDraft {
  return {
    titulo: reporte.titulo,
    descripcion: reporte.descripcion ?? "",
    categoriaId: reporte.categoria_id,
    prioridadId: reporte.prioridad_id,
    estadoId: reporte.estado_id,
    comentarioEstado: "",
    lat: reporte.lat,
    lon: reporte.lon,
  };
}

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
  puedeContactar: boolean;
  currentUser: UsuarioActual | null;
  isAdmin: boolean;
  estados: Estado[];
  categoriasDisponibles: Array<{ id: number; nombre: string }>;
  prioridadesDisponibles: Array<{ id: number; nombre: string }>;
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
  /**
   * Evidencia de reparación con su estado visible y lo que puede hacer esta persona.
   * Se calcula en el servidor; `null` cuando no hay nada que mostrar (S10, S11).
   */
  evidenciaReparacion?: SeccionReparacionVista | null;
};

/**
 * Detalle completo de un reporte: estado, prioridad, ubicación, descripción, imágenes,
 * comentarios y controles de interacción (votos, comentarios y herramientas de administrador).
 * Los datos llegan ya cargados desde la página del servidor; acá solo vive la interacción.
 */
export function ReporteDetalleClient({
  reporte,
  fotografiaPendiente = false,
  puedeContactar,
  currentUser,
  isAdmin,
  estados,
  categoriasDisponibles,
  prioridadesDisponibles,
  comentarios,
  historialEstados,
  fechaCambioEstado,
  gestionOperativa,
  puedeVotar,
  evidenciaReparacion = null,
}: ReporteDetalleInicial) {
  const router = useRouter();
  const [isAdminEditing, setIsAdminEditing] = useState(false);
  const [adminDraft, setAdminDraft] = useState<AdminReportDraft | null>(null);
  const [adminBase, setAdminBase] = useState<AdminReportDraft | null>(null);
  const [adminPhotoDrafts, setAdminPhotoDrafts] = useState<Record<number, AdminReportPhotoDraft>>({});
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const [adminSaveError, setAdminSaveError] = useState<string | null>(null);
  const [votosCount, setVotosCount] = useState(reporte?.votos.noExiste.count ?? 0);
  const [hasVoted, setHasVoted] = useState(reporte?.votos.noExiste.hasVoted ?? false);
  const [isVoting, setIsVoting] = useState(false);
  // Los votos históricos «reparado» se siguen mostrando: el flujo nuevo no los borra (S15).
  const [votosReparadoCount, setVotosReparadoCount] = useState(reporte?.votos.reparado.count ?? 0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ src: string; alt: string } | null>(null);
  // Hoja inferior abierta desde el botón flotante: una sola a la vez (S13, S18).
  const [hojaAbierta, setHojaAbierta] = useState<ClaveAccionFlotante | null>(null);
  // El menú flotante lo controla la ficha para poder cerrarlo antes de abrir una hoja.
  const [menuFlotanteAbierto, setMenuFlotanteAbierto] = useState(false);
  // Botón que abrió la hoja: recibe el foco cuando el Drawer se cierra.
  const [disparadorHoja, setDisparadorHoja] = useState<HTMLElement | null>(null);
  // Enlace del reporte para los mensajes de contacto; se arma al abrir la hoja, ya en el navegador.
  const [urlReporte, setUrlReporte] = useState("");

  // Estados para controlar los AlertDialogs
  const [showDeleteReporteDialog, setShowDeleteReporteDialog] = useState(false);
  const [showVoteLoginDialog, setShowVoteLoginDialog] = useState(false);
  const [showVoteNoExisteDialog, setShowVoteNoExisteDialog] = useState(false);

  const startAdminEditing = () => {
    if (!isAdmin || !reporte) return;
    const initialDraft = createAdminReportDraft(reporte);
    setAdminDraft(initialDraft);
    setAdminBase(initialDraft);
    setAdminPhotoDrafts({});
    setAdminSaveError(null);
    setIsAdminEditing(true);
  };

  const cancelAdminEditing = () => {
    if (isAdminSaving) return;
    setIsAdminEditing(false);
    setAdminDraft(null);
    setAdminBase(null);
    setAdminPhotoDrafts({});
    setAdminSaveError(null);
  };

  const updateAdminDraft = <Key extends keyof AdminReportDraft,>(key: Key, value: AdminReportDraft[Key]) => {
    setAdminSaveError(null);
    setAdminDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateAdminPhotoDraft = (fotoId: number, draft: AdminReportPhotoDraft) => {
    setAdminSaveError(null);
    setAdminPhotoDrafts((current) => ({ ...current, [fotoId]: draft }));
  };

  // Las confirmaciones de eliminación se mantienen separadas del flujo de edición inline.
  const [showAdminDeleteReporteDialog, setShowAdminDeleteReporteDialog] = useState(false);

  // IDs de estados según la base de datos: 1 = Pendiente, 2 = Reparado, 3 = Rechazado
  // Verificar si el reporte está cerrado (Reparado o Rechazado) usando IDs
  const isReporteCerrado = Boolean(
    reporte && (reporte.estado_id === REPORT_STATE_IDS.REPARADO || reporte.estado_id === REPORT_STATE_IDS.RECHAZADO),
  );

  const handleVoteNoExiste = async () => {
    if (!reporte) return;
    if (currentUser?.is_anonymous) {
      setShowVoteLoginDialog(true);
      return;
    }
    if (!currentUser) {
      router.push(`/auth?next=/reportes/${reporte.id}`);
      return;
    }
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

      setVotosCount(result.data.votosNoExiste);
      setVotosReparadoCount(result.data.votosReparado);
      setHasVoted(true);
      toast.success(result.data.primero ? `¡Voto registrado! +${PUNTOS.VOTAR_NO_EXISTE} punto` : result.data.cambio ? "Voto actualizado" : "Tu voto ya estaba registrado");

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

  /**
   * Confirma la reparación informada. El servidor valida autoría, elegibilidad,
   * duplicados y umbral: acá solo se envía la evidencia que la ficha muestra.
   */
  const confirmarEvidenciaReparacion = async (): Promise<ResultadoAccionReparacion> => {
    const evidenciaId = evidenciaReparacion?.evidencia?.evidenciaId;
    if (!reporte || !evidenciaId) {
      return { success: false, error: "No pudimos identificar la evidencia de reparación." };
    }
    return confirmarReparacionAction(reporte.id, evidenciaId);
  };

  /** Impugna la reparación; el motivo se elige de la lista cerrada y lo valida el servidor (S4, S5, S17). */
  const impugnarEvidenciaReparacion = async (motivoClave: string): Promise<ResultadoAccionReparacion> => {
    const evidenciaId = evidenciaReparacion?.evidencia?.evidenciaId;
    if (!reporte || !evidenciaId) {
      return { success: false, error: "No pudimos identificar la evidencia de reparación." };
    }
    return impugnarReparacionAction(reporte.id, evidenciaId, motivoClave);
  };

  /**
   * Informa una reparación con su foto y la frase elegida de la lista; el pipeline
   * existente la manda a moderación (S2, S13, S16).
   */
  const informarEvidenciaReparacion = async (
    fraseClave: string,
    imagen: File,
    captchaToken: string | null,
  ): Promise<ResultadoAccionReparacion> => {
    if (!reporte) return { success: false, error: "No pudimos informar la reparación." };
    return informarReparacionAction(reporte.id, fraseClave, imagen, captchaToken);
  };

  const accionesReparacion: AccionesEvidenciaReparacion = {
    onConfirmar: confirmarEvidenciaReparacion,
    onImpugnar: impugnarEvidenciaReparacion,
    onInformar: informarEvidenciaReparacion,
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

  // ===== GUARDADO GLOBAL DE LA EDICIÓN ADMINISTRATIVA =====
  const saveAdminChanges = async () => {
    if (!isAdmin || !currentUser || !reporte || !adminDraft || !adminBase || isAdminSaving) return;

    setIsAdminSaving(true);
    setAdminSaveError(null);
    const failures: string[] = [];
    const saved: string[] = [];
    const warnings: string[] = [];
    let attempted = false;
    let completed = false;

    const patch: Parameters<typeof actualizarReporteAdminAction>[1] = {};
    const savedFields: Partial<AdminReportDraft> = {};
    if (adminDraft.titulo !== adminBase.titulo) { patch.titulo = adminDraft.titulo; savedFields.titulo = adminDraft.titulo; }
    if (adminDraft.descripcion !== adminBase.descripcion) { patch.descripcion = adminDraft.descripcion; savedFields.descripcion = adminDraft.descripcion; }
    if (adminDraft.categoriaId !== adminBase.categoriaId && adminDraft.categoriaId !== null) { patch.categoriaId = adminDraft.categoriaId; savedFields.categoriaId = adminDraft.categoriaId; }
    if (adminDraft.prioridadId !== adminBase.prioridadId && adminDraft.prioridadId !== null) { patch.prioridadId = adminDraft.prioridadId; savedFields.prioridadId = adminDraft.prioridadId; }
    if (adminDraft.lat !== adminBase.lat || adminDraft.lon !== adminBase.lon) {
      if (adminDraft.lat === null || adminDraft.lon === null) failures.push("La ubicación es obligatoria.");
      else {
        patch.lat = adminDraft.lat;
        patch.lon = adminDraft.lon;
        savedFields.lat = adminDraft.lat;
        savedFields.lon = adminDraft.lon;
      }
    }

    try {
      if (Object.keys(patch).length > 0) {
        attempted = true;
        try {
          const result = await actualizarReporteAdminAction(reporte.id, patch);
          if (!result.success) failures.push(`Datos del reporte: ${result.error}`);
          else {
            completed = true;
            saved.push("datos del reporte");
            setAdminBase((current) => current ? { ...current, ...savedFields } : current);
          }
        } catch (error) {
          failures.push(`Datos del reporte: ${error instanceof Error ? error.message : "error inesperado"}`);
        }
      }

      if (adminDraft.estadoId !== adminBase.estadoId) {
        attempted = true;
        try {
          const result = await cambiarEstadoAdminAction(reporte.id, adminDraft.estadoId, adminDraft.comentarioEstado.trim() || undefined);
          if (!result.success) failures.push(`Estado: ${result.error}`);
          else {
            completed = true;
            saved.push("estado e historial");
            setAdminBase((current) => current ? { ...current, estadoId: adminDraft.estadoId, comentarioEstado: "" } : current);
            setAdminDraft((current) => current ? { ...current, comentarioEstado: "" } : current);
          }
        } catch (error) {
          failures.push(`Estado: ${error instanceof Error ? error.message : "error inesperado"}`);
        }
      }

      const clearPhotoDraft = (fotoId: number) => {
        setAdminPhotoDrafts((current) => {
          const previous = current[fotoId];
          return previous
            ? { ...current, [fotoId]: { file: null, remove: false, version: previous.version + 1 } }
            : current;
        });
      };

      for (const [index, foto] of (reporte.fotos_reporte ?? []).entries()) {
        const photoDraft = adminPhotoDrafts[foto.id];
        if (!photoDraft || (!photoDraft.remove && !photoDraft.file)) continue;

        attempted = true;
        try {
          if (photoDraft.remove) {
            const result = await quitarFotoReporteAdminAction(reporte.id, foto.id);
            if (!result.success) {
              failures.push(`Foto ${index + 1}: ${result.error}`);
              continue;
            }
            completed = true;
            saved.push(`foto ${index + 1} quitada`);
            clearPhotoDraft(foto.id);
            if (result.data.cleanupPending) warnings.push(`Quedó pendiente limpiar el archivo de la foto ${index + 1}.`);
            continue;
          }

          if (!photoDraft.file) continue;
          const optimized = await optimizeReportImage(photoDraft.file);
          const result = await reemplazarFotoReporteAdminAction(reporte.id, foto.id, optimized.file);
          if (!result.success) {
            failures.push(`Foto ${index + 1}: ${result.error}`);
            continue;
          }

          completed = true;
          clearPhotoDraft(foto.id);
          if (result.data.estado === "REJECTED" || result.data.estado === "ERROR_PRIVADO") {
            failures.push(`Foto ${index + 1}: ${result.data.motivos[0] ?? "No pudo enviarse a revisión."}`);
          } else if (result.data.publicada) {
            saved.push(`foto ${index + 1} reemplazada`);
          } else {
            saved.push(`foto ${index + 1} enviada a revisión`);
          }
          if (result.data.advertencias.length) warnings.push(`La limpieza del reemplazo de la foto ${index + 1} quedó pendiente.`);
        } catch (error) {
          failures.push(`Foto ${index + 1}: ${error instanceof Error ? error.message : "error inesperado"}`);
        }
      }

      if (attempted) router.refresh();

      const details = [
        saved.length ? `Guardado: ${saved.join(", ")}.` : "",
        failures.length ? `No se completó: ${failures.join(" ")}` : "",
        warnings.length ? warnings.join(" ") : "",
      ].filter(Boolean).join(" ");

      if (failures.length) {
        setAdminSaveError(completed
          ? "Algunos cambios no se pudieron guardar. Revisá los datos e intentá de nuevo."
          : "No se pudieron guardar los cambios. Revisá los datos e intentá de nuevo.");
        toast.error(completed ? "Guardado parcial" : "No se pudieron guardar los cambios", { description: details });
        return;
      }

      if (!attempted) toast.info("No hay cambios para guardar.");
      else if (warnings.length) toast.warning("Cambios guardados con observaciones", { description: details });
      else toast.success("Cambios guardados", { description: details });

      setIsAdminEditing(false);
      setAdminDraft(null);
      setAdminBase(null);
      setAdminPhotoDrafts({});
    } finally {
      setIsAdminSaving(false);
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

  const diasDesdeCreacion = Math.max(0, dayjs().tz(ZONA_HORARIA).startOf("day").diff(dayjs(parseFechaReporte(reporte.created_at)).tz(ZONA_HORARIA).startOf("day"), "day"));
  const adminDraftForRender = adminDraft ?? createAdminReportDraft(reporte);
  const adminBaseForRender = adminBase ?? adminDraftForRender;
  const tiempoReparacion = fechaCambioEstado && reporte.estado_id === REPORT_STATE_IDS.REPARADO
    ? formatRepairDuration(reporte.created_at, fechaCambioEstado)
    : null;
  const fotoOriginalDelReporte = reporte.fotos_reporte?.find((foto) => Boolean(foto.publicUrl ?? foto.url));
  const fotoAntesComparacion = fotoOriginalDelReporte
    ? { src: (fotoOriginalDelReporte.publicUrl ?? fotoOriginalDelReporte.url) as string, fecha: reporte.created_at }
    : null;

  // ===== Acciones flotantes y hojas del detalle (S13, S18) =====
  /**
   * Abre una hoja recordando el botón que la originó y cerrando antes el menú flotante:
   * nunca queda un menú desplegado detrás del velo y el foco vuelve a un control real.
   */
  const abrirHoja = (hoja: ClaveAccionFlotante, disparador: HTMLElement | null) => {
    setDisparadorHoja(disparador);
    setMenuFlotanteAbierto(false);
    setHojaAbierta(hoja);
  };

  /**
   * Arma el enlace del reporte recién al abrir los contactos: `window` sólo existe en el
   * navegador y el mensaje de los organismos lo usa para citar la publicación real.
   */
  const manejadoresAccionesFlotantes: Record<ClaveAccionFlotante, (disparador: HTMLElement | null) => void> = {
    contactos: (disparador) => {
      setUrlReporte(new URL(`/reportes/${reporte.id}`, window.location.origin).toString());
      abrirHoja("contactos", disparador);
    },
    ubicacion: (disparador) => abrirHoja("ubicacion", disparador),
    reparacion: (disparador) => abrirHoja("reparacion", disparador),
    comentar: (disparador) => abrirHoja("comentar", disparador),
  };

  const contextoAccionesFlotantes: ContextoAccionesFlotantes = {
    sesion: { haySesion: Boolean(currentUser), esAnonimo: Boolean(currentUser?.is_anonymous) },
    reporteCerrado: Boolean(isReporteCerrado),
    tieneUbicacion: reporte.lat !== null && reporte.lon !== null,
    puedeContactar,
    reparacion: evidenciaReparacion
      ? { hayEvidencia: evidenciaReparacion.evidencia !== null, puedeInformar: evidenciaReparacion.puedeInformar }
      : null,
  };
  const accionesFlotantes = construirAccionesFlotantes(
    accionesDisponibles(contextoAccionesFlotantes),
    manejadoresAccionesFlotantes,
  );

  /** Descripción honesta de la hoja de reparación: depende del estado real de la evidencia. */
  const descripcionReparacion = !evidenciaReparacion?.evidencia
    ? "Subí una foto y elegí qué se arregló. La foto pasa por moderación antes de publicarse."
    : evidenciaReparacion.evidencia.estado === "reparado"
      ? "La reparación quedó validada y el reporte está Reparado."
      : evidenciaReparacion.evidencia.estado === "informada"
        ? "La foto está en moderación. El reporte sigue Pendiente hasta que la comunidad confirme."
        : `La comunidad está confirmando la reparación. Con ${evidenciaReparacion?.umbral ?? 3} confirmaciones el reporte pasa a Reparado.`;
  const showVoteButtons = (!currentUser || currentUser.is_anonymous || puedeVotar) && !isAdmin && !isReporteCerrado;
  const showVoteFooter = Boolean(
    isReporteCerrado ||
    currentUser?.id === reporte.usuario_id ||
    (!isAdmin && (!currentUser || currentUser.is_anonymous || puedeVotar))
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FranjaUbicacion
            lat={reporte.lat}
            lon={reporte.lon}
            onVerUbicacion={(disparador) => abrirHoja("ubicacion", disparador)}
          />
          {evidenciaReparacion && (
            <ResumenReparacion
              seccion={evidenciaReparacion}
              onVer={(disparador) => abrirHoja("reparacion", disparador)}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Contenido Principal */}
          <div className="space-y-4 lg:col-span-7">
            {/* Encabezado del Reporte */}
            <Card className="gap-0">
              <CardHeader className="pb-3">
                <div className="col-span-full mb-1 flex items-center gap-1.5 border-b border-border pb-1 text-xs text-muted-foreground">
                  <Calendar className="size-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    Creado el día{" "}
                    {parseFechaReporte(reporte.created_at).toLocaleDateString("es-AR", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: ZONA_HORARIA,
                    })}
                    {" "}<span className="font-bold">
                      (hace {diasDesdeCreacion} {diasDesdeCreacion === 1 ? "día" : "días"})
                    </span>
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-1">
                  {isAdmin ? (
                    <AdminInlineField
                      key={`priority-${isAdminEditing ? "editing" : "display"}`}
                      editing={isAdminEditing}
                      label="prioridad"
                      value={adminDraftForRender.prioridadId}
                      onChange={(value) => updateAdminDraft("prioridadId", value)}
                      disabled={isAdminSaving}
                      className="min-w-0"
                      display={() => <Badge variant={getPriorityVariant(getNameFromRelation(reporte.prioridades))} className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Prioridad</span><span className="inline-flex items-center gap-1">{getPriorityIcon(getNameFromRelation(reporte.prioridades), "size-3")}{getNameFromRelation(reporte.prioridades)}</span></Badge>}
                      editor={(value, onChange) => (
                        <Select value={value?.toString() ?? ""} disabled={isAdminSaving} onValueChange={(id) => onChange(Number(id))}>
                          <SelectTrigger aria-label="Prioridad del reporte" className="min-h-10 w-full"><SelectValue placeholder="Elegir prioridad" /></SelectTrigger>
                          <SelectContent>{prioridadesDisponibles.map((prioridad) => <SelectItem key={prioridad.id} value={String(prioridad.id)}>{prioridad.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Badge variant={getPriorityVariant(getNameFromRelation(reporte.prioridades))} className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Prioridad</span><span className="inline-flex items-center gap-1">{getPriorityIcon(getNameFromRelation(reporte.prioridades), "size-3")}{getNameFromRelation(reporte.prioridades)}</span></Badge>
                  )}
                  {isAdmin ? (
                    <AdminInlineField
                      key={`status-${isAdminEditing ? "editing" : "display"}`}
                      editing={isAdminEditing}
                      label="estado"
                      value={{ estadoId: adminDraftForRender.estadoId, comentario: adminDraftForRender.comentarioEstado }}
                      onChange={(value) => setAdminDraft((current) => current ? { ...current, estadoId: value.estadoId, comentarioEstado: value.comentario } : current)}
                      disabled={isAdminSaving}
                      className="min-w-0"
                      display={() => <Badge variant={getStatusVariant(getNameFromRelation(reporte.estados))} className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Estado</span><span className="inline-flex items-center gap-1">{getStatusIcon(getNameFromRelation(reporte.estados), "size-3")}{getNameFromRelation(reporte.estados)}</span></Badge>}
                      editor={(draft, onChange) => (
                        <div className="min-w-0 space-y-2">
                          <Select value={draft.estadoId.toString()} disabled={isAdminSaving} onValueChange={(id) => {
                            const estadoId = Number(id);
                            onChange({ ...draft, estadoId, comentario: estadoId === adminBaseForRender.estadoId ? "" : draft.comentario });
                          }}>
                            <SelectTrigger aria-label="Estado del reporte" className="min-h-10 w-full"><SelectValue placeholder="Elegir estado" /></SelectTrigger>
                            <SelectContent>{estados.map((estado) => <SelectItem key={estado.id} value={String(estado.id)}>{estado.nombre}</SelectItem>)}</SelectContent>
                          </Select>
                          {draft.estadoId !== adminBaseForRender.estadoId && <Textarea aria-label="Comentario del cambio de estado (opcional)" placeholder="Comentario del cambio (opcional)" value={draft.comentario} disabled={isAdminSaving} onChange={(event) => onChange({ ...draft, comentario: event.target.value })} className="min-h-20 resize-y text-sm" />}
                        </div>
                      )}
                    />
                  ) : (
                    <Badge variant={getStatusVariant(getNameFromRelation(reporte.estados))} className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Estado</span><span className="inline-flex items-center gap-1">{getStatusIcon(getNameFromRelation(reporte.estados), "size-3")}{getNameFromRelation(reporte.estados)}</span></Badge>
                  )}
                  {isAdmin ? (
                    <AdminInlineField
                      key={`category-${isAdminEditing ? "editing" : "display"}`}
                      editing={isAdminEditing}
                      label="categoría"
                      value={adminDraftForRender.categoriaId}
                      onChange={(value) => updateAdminDraft("categoriaId", value)}
                      disabled={isAdminSaving}
                      className="min-w-0"
                      display={() => <Badge variant="category" className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Categoría</span><span className="inline-flex items-center gap-1">{getCategoryIcon(getNameFromRelation(reporte.categorias), "size-3")}{getNameFromRelation(reporte.categorias)}</span></Badge>}
                      editor={(value, onChange) => (
                        <Select value={value?.toString() ?? ""} disabled={isAdminSaving} onValueChange={(id) => onChange(Number(id))}>
                          <SelectTrigger aria-label="Categoría del reporte" className="min-h-10 w-full"><SelectValue placeholder="Elegir categoría" /></SelectTrigger>
                          <SelectContent>{categoriasDisponibles.map((categoria) => <SelectItem key={categoria.id} value={String(categoria.id)}>{categoria.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Badge variant="category" className="flex flex-col items-start gap-1 px-2 py-1 text-[10px] leading-none"><span className="pl-4 text-[8px] font-medium normal-case leading-none tracking-normal opacity-90">Categoría</span><span className="inline-flex items-center gap-1">{getCategoryIcon(getNameFromRelation(reporte.categorias), "size-3")}{getNameFromRelation(reporte.categorias)}</span></Badge>
                  )}
                </div>
                <div className="flex min-w-0 items-start gap-3">
                  {isAdmin ? (
                    <AdminInlineField
                      key={`title-${isAdminEditing ? "editing" : "display"}`}
                      editing={isAdminEditing}
                      label="título"
                      value={adminDraftForRender.titulo}
                      onChange={(value) => updateAdminDraft("titulo", value)}
                      disabled={isAdminSaving}
                      className="min-w-0 flex-1"
                      display={(value) => <CardTitle className="min-w-0 break-words text-xl font-bold tracking-tight md:text-2xl">{value}</CardTitle>}
                      editor={(value, onChange) => <Input aria-label="Título del reporte" value={value} maxLength={120} disabled={isAdminSaving} onChange={(event) => onChange(event.target.value)} className="min-h-11 text-base" />}
                    />
                  ) : (
                    <CardTitle className="min-w-0 flex-1 break-words text-xl font-bold tracking-tight md:text-2xl">{reporte.titulo}</CardTitle>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!showVoteButtons && (
                      <Button variant="outline" size="icon" className="size-10" onClick={handleShareReport} aria-label="Compartir reporte" title="Compartir reporte">
                        <Share2 className="size-4" />
                      </Button>
                    )}
                    {isAdmin && !isAdminEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 min-h-10 min-w-10 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={startAdminEditing}
                        aria-label="Editar reporte"
                        title="Editar reporte"
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="destructive" size="icon" className="size-10" onClick={handleAdminDeleteReporte} aria-label="Eliminar reporte como administrador" title="Eliminar reporte como administrador">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    {currentUser && !isAdmin && currentUser.id === reporte.usuario_id && (
                      <Button variant="destructive" size="icon" className="size-8" onClick={handleDeleteReporte} disabled={isDeleting} aria-label={isDeleting ? "Eliminando reporte" : "Eliminar reporte"} title="Eliminar reporte">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {isAdmin ? (
                  <AdminInlineField
                    key={`description-${isAdminEditing ? "editing" : "display"}`}
                    editing={isAdminEditing}
                    label="descripción"
                    value={adminDraftForRender.descripcion}
                    onChange={(value) => updateAdminDraft("descripcion", value)}
                    disabled={isAdminSaving}
                    className="mb-4 w-full"
                    display={(value) => <p className="text-xs leading-relaxed text-foreground">{value}</p>}
                    editor={(value, onChange) => <Textarea aria-label="Descripción del reporte" value={value} maxLength={5000} disabled={isAdminSaving} onChange={(event) => onChange(event.target.value)} className="min-h-28 resize-y text-sm md:text-base" />}
                  />
                ) : (
                  <p className="mb-4 text-xs leading-relaxed text-foreground">{reporte.descripcion}</p>
                )}

                {fotografiaPendiente && (
                  <p role="status" className="mb-4 rounded-lg border border-amber-600/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-foreground">
                    Fotografía pendiente de revisión
                  </p>
                )}

                {/* Imágenes */}
                {reporte.fotos_reporte && reporte.fotos_reporte.length > 0 && (
                  <div className="mb-4 flex flex-col items-center gap-3 md:mb-6 lg:mb-8">
                    {reporte.fotos_reporte.map((foto, index) => (
                      <div key={foto.id} className="relative w-full max-w-2xl">
                        <button
                          type="button"
                          aria-label={`Ver imagen ${index + 1} del reporte en grande`}
                          onClick={() => setSelectedPhoto({ src: foto.publicUrl || foto.url || "/placeholder.svg", alt: `Imagen ${index + 1} del reporte` })}
                          className="flex aspect-video w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-md bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-lg lg:rounded-xl"
                        >
                          <img
                            src={foto.publicUrl || foto.url || "/placeholder.svg"}
                            alt={`Imagen ${index + 1} del reporte`}
                            loading={index === 0 ? undefined : "lazy"}
                            className="h-full w-full object-contain"
                          />
                        </button>
                        {isAdmin && isAdminEditing && (
                          <AdminReportPhotoControls
                            fotoId={foto.id}
                            index={index}
                            draft={adminPhotoDrafts[foto.id] ?? { file: null, remove: false, version: 0 }}
                            onChange={(draft) => updateAdminPhotoDraft(foto.id, draft)}
                            disabled={isAdminSaving}
                          />
                        )}
                      </div>
                    ))}
                    <Dialog open={selectedPhoto !== null} onOpenChange={(open) => { if (!open) setSelectedPhoto(null) }}>
                      <DialogContent showClose={false} className="w-auto max-w-[95vw] gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:p-0">
                        <DialogClose asChild>
                          <Button variant="outline" size="icon" aria-label="Cerrar imagen ampliada" className="absolute right-2 top-2 z-10 size-10 rounded-full border-white bg-white text-black shadow-lg hover:bg-white/90">
                            <X className="size-5" aria-hidden="true" />
                          </Button>
                        </DialogClose>
                        <DialogTitle className="sr-only">Imagen ampliada del reporte</DialogTitle>
                        <DialogDescription className="sr-only">{selectedPhoto?.alt}</DialogDescription>
                        {selectedPhoto && <img src={selectedPhoto.src} alt={selectedPhoto.alt} className="max-h-[90dvh] max-w-[95vw] object-contain" />}
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {/* Autor y Fecha */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[10px]">
                      {getUserInitials(getUsernameFromRelation(reporte.profiles))}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">Reportado por {getUsernameFromRelation(reporte.profiles)}</span>
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
                {puedeContactar && reporte.lat !== null && reporte.lon !== null && (
                  <div className="mt-2 mb-3">
                    <ReportContactDialog
                      title={reporte.titulo}
                      category={getNameFromRelation(reporte.categorias)}
                      description={reporte.descripcion ?? ""}
                      latitude={reporte.lat}
                      longitude={reporte.lon}
                      date={parseFechaReporte(reporte.created_at).toLocaleDateString("es-AR", { timeZone: ZONA_HORARIA })}
                      reportId={reporte.id}
                    />
                  </div>
                )}
                {showVoteFooter && (
                  <div className="mt-3">
                    <hr className="mb-2 border-border" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {showVoteButtons && (
                        <div role="group" aria-label="Acciones sobre el reporte" className="mx-auto grid w-full max-w-56 grid-cols-2 justify-items-center gap-4">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="aspect-square h-auto min-h-11 w-full max-w-16 flex-col gap-1 whitespace-normal rounded-full px-1 text-center text-[10px] leading-tight text-muted-foreground hover:bg-muted"
                            onClick={handleShareReport}
                            aria-label="Compartir reporte"
                          >
                            <Share2 className="size-4" />
                            Compartir
                          </Button>
                          {(!currentUser || currentUser.is_anonymous || currentUser.id !== reporte.usuario_id) && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="aspect-square h-auto min-h-11 w-full max-w-16 flex-col gap-1 whitespace-normal rounded-full px-1 text-center text-[10px] leading-tight text-destructive hover:bg-destructive/10"
                              onClick={handleVoteNoExiste}
                              disabled={hasVoted || isVoting}
                              aria-pressed={hasVoted}
                            >
                              <ThumbsDown className="size-4" />
                              No existe{hasVoted ? " · Tu voto" : ""}
                            </Button>
                          )}
                        </div>
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

            {isAdmin && isAdminEditing && (
              <AdminReportEditActions
                saving={isAdminSaving}
                errorMessage={adminSaveError}
                onSave={() => void saveAdminChanges()}
                onCancel={cancelAdminEditing}
              />
            )}
          </div>

          {/* Actividad y barra lateral: la línea de tiempo queda junto al reporte (S13, S18) */}
          <div className="lg:col-span-5 space-y-4 md:space-y-6">

            <CommentsSection
              comments={comentarios}
              statusHistory={historialEstados}
              currentUser={currentUser}
              reportOwnerId={reporte.usuario_id}
              isAdmin={isAdmin}
              isClosed={Boolean(isReporteCerrado)}
              compositorAbierto={hojaAbierta === "comentar"}
              onCambiarCompositor={(abierta) => setHojaAbierta(abierta ? "comentar" : null)}
              disparadorCompositor={disparadorHoja}
              onSubmitComment={(content, captchaToken) => crearComentarioAction(reporte.id, content, captchaToken)}
              onDeleteComment={async (commentId) => {
                const result = await eliminarComentarioPropioAction(commentId)
                return result.success ? { success: true } : { success: false, error: String(result.error || "") }
              }}
              onAdminDeleteComment={async (commentId) => {
                const result = await eliminarComentarioAdminAction(commentId)
                return result.success ? { success: true } : { success: false, error: String(result.error || "") }
              }}
            />

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

            {/* Ubicación: para administración es el editor de coordenadas; el resto
                de las personas entra por la franja superior y su hoja. */}
            {isAdmin && (
            <Card id="reporte-ubicacion-map" className="scroll-mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base md:text-lg">Ubicación</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {isAdmin ? (
                  <AdminInlineField
                    key={`location-${isAdminEditing ? "editing" : "display"}`}
                    editing={isAdminEditing}
                    label="ubicación"
                    value={{ lat: adminDraftForRender.lat, lon: adminDraftForRender.lon }}
                    onChange={(coordinates) => setAdminDraft((current) => current ? { ...current, lat: coordinates.lat, lon: coordinates.lon } : current)}
                    disabled={isAdminSaving}
                    className="w-full"
                    display={() => (
                      <Link href="/mapa" className="group block w-full">
                        <div className="group relative aspect-square overflow-hidden rounded-md border shadow-sm transition-all group-hover:shadow-md md:rounded-lg">
                          {reporte.lat !== null && reporte.lon !== null ? (
                            <MiniMap lat={reporte.lat} lon={reporte.lon} />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">Ubicación no disponible</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                          <div className="absolute inset-x-2 bottom-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur-sm md:inset-x-3 md:bottom-3">
                            <div className="flex items-center gap-2 text-xs text-foreground">
                              <MapPin className="size-4 shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">Ver en mapa completo</p>
                                {reporte.lat === null || reporte.lon === null ? <p className="truncate text-xs text-muted-foreground">Ubicación no disponible</p> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )}
                    editor={(coordinates, onChange) => (
                      <div className="space-y-2">
                        <LocationPickerMap
                          key={coordinates.lat === null ? "no-location" : "has-location"}
                          initialLat={coordinates.lat}
                          initialLon={coordinates.lon}
                          heightClassName="h-48"
                          onLocationSelect={(lat, lon) => onChange({ lat, lon })}
                        />
                      </div>
                    )}
                  />
                ) : (
                  <Link href="/mapa" className="group block">
                    <div className="group relative aspect-square overflow-hidden rounded-md border shadow-sm transition-all group-hover:shadow-md md:rounded-lg">
                      {reporte.lat !== null && reporte.lon !== null ? (
                        <MiniMap lat={reporte.lat} lon={reporte.lon} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">Ubicación no disponible</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="absolute inset-x-2 bottom-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur-sm md:inset-x-3 md:bottom-3">
                        <div className="flex items-center gap-2 text-xs text-foreground">
                          <MapPin className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">Ver en mapa completo</p>
                            {reporte.lat === null || reporte.lon === null ? <p className="truncate text-xs text-muted-foreground">Ubicación no disponible</p> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}
              </CardContent>
            </Card>
            )}
          </div>
        </div>

      </div>

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

      <AlertDialog open={showVoteLoginDialog} onOpenChange={setShowVoteLoginDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciá sesión para votar</AlertDialogTitle>
            <AlertDialogDescription>Para votar necesitás iniciar sesión con una cuenta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendido</AlertDialogAction>
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
            <AlertDialogDescription>{hasVoted ? "Tu voto ya está registrado." : "Tu primer voto sumará 1 punto."}</AlertDialogDescription>
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

      {/* Hojas inferiores del botón flotante: el mismo Drawer del filtro del mapa (S18) */}
      <HojaReporte
        abierta={hojaAbierta === "reparacion"}
        disparador={disparadorHoja}
        cambiandoAbierta={(abierta) => setHojaAbierta(abierta ? "reparacion" : null)}
        titulo="¿Ya lo arreglaron?"
        descripcion={descripcionReparacion}
        etiquetaCerrar="Cerrar la hoja de reparación"
      >
        {evidenciaReparacion ? (
          <EvidenciaReparacion
            seccion={evidenciaReparacion}
            fotoAntes={fotoAntesComparacion}
            acciones={accionesReparacion}
          />
        ) : null}
      </HojaReporte>

      <HojaReporte
        abierta={hojaAbierta === "ubicacion"}
        disparador={disparadorHoja}
        cambiandoAbierta={(abierta) => setHojaAbierta(abierta ? "ubicacion" : null)}
        titulo="Ubicación"
        descripcion="El mapa del reporte y el acceso al mapa completo de la ciudad."
        etiquetaCerrar="Cerrar la ubicación"
      >
        <ContenidoUbicacion lat={reporte.lat} lon={reporte.lon} />
      </HojaReporte>

      <HojaReporte
        abierta={hojaAbierta === "contactos"}
        disparador={disparadorHoja}
        cambiandoAbierta={(abierta) => setHojaAbierta(abierta ? "contactos" : null)}
        titulo="Contactar a organismos"
        descripcion={CONTACT_DISCLAIMER}
        etiquetaCerrar="Cerrar los contactos"
      >
        {reporte.lat !== null && reporte.lon !== null && (
          <ReportContactActions
            title={reporte.titulo}
            category={getNameFromRelation(reporte.categorias)}
            description={reporte.descripcion ?? ""}
            latitude={reporte.lat}
            longitude={reporte.lon}
            date={parseFechaReporte(reporte.created_at).toLocaleDateString("es-AR", { timeZone: ZONA_HORARIA })}
            reportUrl={urlReporte}
            showHeading={false}
          />
        )}
      </HojaReporte>

      <AccionesFlotantes
        acciones={accionesFlotantes}
        abierta={menuFlotanteAbierto}
        onCambiarAbierta={setMenuFlotanteAbierto}
      />
    </div>
  );
}
