"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Calendar, MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Comentario } from "@/database/queries/reportes/[id]/index";
import { PUNTOS } from "@/database/queries/puntos";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  APORTES_COMUNITARIOS,
  mergeReportActivity,
} from "@/lib/reportes/aportes";
import { getUsernameFromRelation } from "@/lib/identity/display";
import {
  MENSAJE_CAPTCHA_NO_DISPONIBLE,
  TURNSTILE_CONFIGURADO,
  TURNSTILE_NO_DISPONIBLE,
  TurnstileWidget,
} from "@/components/turnstile-widget";
import { debeAvisarVerificacionVencida } from "./verificacion-de-aporte";

/**
 * Action que Turnstile vincula al aporte público. `app/reportes/[id]/actions.ts` verifica el
 * mismo valor con Siteverify, así un token emitido para otro formulario no sirve acá.
 */
const ACCION_CAPTCHA_COMENTARIO = "comentar_reporte";

dayjs.extend(utc);
dayjs.extend(timezone);

type CommentSubmitResult =
  | { success: true; data: { comment: Comentario; pointsAwarded: number } }
  | { success: false; error?: string };

type CommentDeleteResult = { success: boolean; error?: string };

/** Only the session fields the detail page needs; the full auth user never reaches the client. */
export type UsuarioActual = Pick<User, "id" | "is_anonymous">;

export type CommentsSectionProps = {
  comments: Comentario[];
  statusHistory: Array<{
    id: number;
    reporte_id: number;
    estado_nuevo_id: number;
    created_at: string;
    comentario: string | null;
    estado_nuevo?:
      | { id: number; nombre: string }
      | { id: number; nombre: string }[]
      | null;
    usuario?: { username: string | null } | null;
  }>;
  currentUser: UsuarioActual | null;
  reportOwnerId: string | null;
  isAdmin: boolean;
  isClosed: boolean;
  onSubmitComment: (
    content: string,
    captchaToken: string | null,
  ) => Promise<CommentSubmitResult>;
  onDeleteComment: (commentId: number) => Promise<CommentDeleteResult>;
  onAdminDeleteComment: (commentId: number) => Promise<CommentDeleteResult>;
};

export function CommentsSection({
  comments: initialComments,
  statusHistory,
  currentUser,
  reportOwnerId,
  isAdmin,
  isClosed,
  onSubmitComment,
  onDeleteComment,
  onAdminDeleteComment,
}: CommentsSectionProps) {
  const [comments, setComments] = useState(initialComments);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [adminDeleteDialogOpen, setAdminDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  // Toda publicación se verifica en el servidor, así que cada aporte resuelve un challenge.
  const needsCaptcha = TURNSTILE_CONFIGURADO;
  // Producción sin configuración completa nunca publica sin protección.
  const captchaNoDisponible = TURNSTILE_NO_DISPONIBLE;
  const canPublish =
    Boolean(newComment) &&
    !isSubmitting &&
    !captchaNoDisponible &&
    (!needsCaptcha || captchaToken !== null);
  // El widget queda detrás del diálogo: si el token vence con el diálogo abierto, se explica ahí.
  const verificacionVencida = debeAvisarVerificacionVencida({
    exigeVerificacion: needsCaptcha,
    verificacionNoDisponible: captchaNoDisponible,
    token: captchaToken,
    publicando: isSubmitting,
  });

  /**
   * Olvida el token que se acaba de consumir y pide un challenge nuevo, así un reintento nunca
   * envía un token ya usado. El aporte elegido se conserva: el fallo no borra el formulario.
   */
  const requestNewCaptcha = () => {
    if (!needsCaptcha) return;
    setCaptchaToken(null);
    setCaptchaResetSignal((signal) => signal + 1);
  };

  const pathname = usePathname();
  const selectedComment = comments.find(
    (comment) => comment.id === commentToDelete,
  );
  const newCommentLabel =
    APORTES_COMUNITARIOS.find(({ key }) => key === newComment)?.label ??
    newComment;
  const willAwardPoints = Boolean(
    currentUser && currentUser.id !== reportOwnerId,
  );
  const activity = mergeReportActivity(comments, statusHistory);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser || !newComment || !canPublish) return;
    setPublishDialogOpen(true);
  };

  const confirmSubmit = async () => {
    if (!currentUser || !newComment) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmitComment(newComment.trim(), captchaToken);
      if (!result.success) {
        toast.error("Error al publicar la actualización", {
          description: result.error || "Por favor, intentá nuevamente",
        });
        return;
      }

      setComments((currentComments) => [
        ...currentComments,
        result.data.comment,
      ]);
      setNewComment("");
      toast.success(
        result.data.pointsAwarded > 0
          ? `¡Actualización publicada! +${result.data.pointsAwarded} puntos`
          : "¡Actualización publicada!",
        { description: "Tu actualización ya forma parte del seguimiento" },
      );
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar el comentario", {
        description: "Por favor, intenta nuevamente",
      });
    } finally {
      // El intento consumió el token, haya publicado o no: el siguiente necesita otro.
      requestNewCaptcha();
      setIsSubmitting(false);
      setPublishDialogOpen(false);
    }
  };

  const requestDelete = (commentId: number, admin: boolean) => {
    setCommentToDelete(commentId);
    if (admin) setAdminDeleteDialogOpen(true);
    else setDeleteDialogOpen(true);
  };

  const confirmDelete = async (admin: boolean) => {
    if (!currentUser || commentToDelete === null) return;

    try {
      const result = await (admin ? onAdminDeleteComment : onDeleteComment)(
        commentToDelete,
      );
      if (!result.success) {
        toast.error("Error al eliminar el comentario", {
          description: result.error || "Por favor, intenta nuevamente",
        });
        return;
      }

      setComments((currentComments) =>
        currentComments.filter((comment) => comment.id !== commentToDelete),
      );
      toast.success(
        admin
          ? "Comentario eliminado por el administrador"
          : "Comentario eliminado",
        {
          description: "El comentario ha sido eliminado correctamente",
        },
      );
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al procesar la eliminación", {
        description: "Por favor, intenta nuevamente",
      });
    } finally {
      setCommentToDelete(null);
      setDeleteDialogOpen(false);
      setAdminDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base md:text-xl">
            <MessageCircle className="size-4 md:size-5" />
            <span>Actualizaciones y Comentarios</span>
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {isClosed
              ? "Este reporte está cerrado. Consultá el historial de actualizaciones."
              : "Compartí una novedad y consultá el seguimiento del reporte."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {!isClosed && (!currentUser || currentUser.is_anonymous) && (
            <p className="rounded-xl border border-border/70 bg-muted/60 p-3 text-xs text-muted-foreground">
              {currentUser?.is_anonymous ? (
                "Para comentar, vinculá tu correo y guardá tu cuenta. Como invitado podés crear y seguir tus reportes."
              ) : (
                <>
                  Para comentar,{" "}
                  <Link
                    href={`/auth?next=${encodeURIComponent(pathname)}`}
                    className="font-medium text-primary hover:underline"
                  >
                    iniciá sesión
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <div className="space-y-3">
            {activity.length === 0 && !isClosed ? (
              <div className="text-center text-muted-foreground md:py-8">
                <MessageCircle className="mx-auto mb-3 size-10 opacity-50" />
                <p className="text-sm">Aún no hay actividad</p>
                <p className="text-xs">Sé el primero en actualizar</p>
              </div>
            ) : (
              activity.map((entry) => {
                if (entry.kind === "status")
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 sm:p-4"
                    >
                      <p className="whitespace-pre-wrap break-words text-sm font-medium">
                        {entry.content}
                      </p>
                      {entry.detail && (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {entry.detail}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {dayjs
                          .utc(entry.createdAt)
                          .tz("America/Argentina/Buenos_Aires")
                          .format("DD/MM/YYYY HH:mm")}
                      </p>
                    </div>
                  );
                const comment = comments.find(
                  (item) => `comment-${item.id}` === entry.id,
                )!;
                const canDelete = Boolean(
                  currentUser &&
                  (isClosed
                    ? isAdmin
                    : currentUser.id === comment.usuario_id || isAdmin),
                );
                const adminDelete = Boolean(
                  isClosed ||
                  (isAdmin && currentUser?.id !== comment.usuario_id),
                );
                return (
                  <div
                    key={entry.id}
                    className="space-y-2 rounded-md border p-3 transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {entry.username}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3 shrink-0" />
                          <span>
                            {dayjs
                              .utc(entry.createdAt)
                              .tz("America/Argentina/Buenos_Aires")
                              .format("DD/MM/YYYY HH:mm")}
                          </span>
                        </p>
                      </div>
                      {currentUser && canDelete && (!isClosed || isAdmin) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => requestDelete(comment.id, adminDelete)}
                          className="size-9 shrink-0 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title={
                            adminDelete
                              ? "Eliminar comentario (Admin)"
                              : "Eliminar comentario"
                          }
                          aria-label={
                            adminDelete
                              ? "Eliminar comentario (Admin)"
                              : "Eliminar comentario"
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {entry.content}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {!isClosed && currentUser && !currentUser.is_anonymous && (
            <form
              onSubmit={handleSubmit}
              className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3 sm:p-4"
            >
              <label
                htmlFor="report-contribution"
                className="block text-sm font-medium"
              >
                ¿Qué novedad tenés?
              </label>
              <select
                id="report-contribution"
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                disabled={isSubmitting}
                className="min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground"
              >
                <option value="">Elegí una actualización…</option>
                {APORTES_COMUNITARIOS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {captchaNoDisponible && (
                <Alert variant="destructive">
                  <AlertTitle>Verificación de seguridad no disponible</AlertTitle>
                  <AlertDescription>
                    {MENSAJE_CAPTCHA_NO_DISPONIBLE}
                  </AlertDescription>
                </Alert>
              )}
              {needsCaptcha && !captchaNoDisponible && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Verificación de seguridad</p>
                  <TurnstileWidget
                    onTokenChange={setCaptchaToken}
                    resetSignal={captchaResetSignal}
                    action={ACCION_CAPTCHA_COMENTARIO}
                  />
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 max-w-full"
                  disabled={!canPublish}
                >
                  <Send className="mr-1.5 size-3 md:mr-2 md:size-4" />
                  <span className="text-sm">
                    {isSubmitting ? "Publicando..." : "Publicar"}
                  </span>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Send className="size-4" aria-hidden="true" />
              </span>
              ¿Publicar actualización?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Revisá la actualización antes de publicarla.</p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {newCommentLabel}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {willAwardPoints ? (
                    <>
                      Ganarás{" "}
                      <span className="font-bold text-primary">
                        {PUNTOS.COMENTAR_REPORTE} puntos
                      </span>{" "}
                      por compartir la actualización.
                    </>
                  ) : (
                    "Como es tu propio reporte, esta actualización no suma puntos."
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {verificacionVencida && (
            <Alert variant="destructive">
              <AlertTitle>La verificación de seguridad venció</AlertTitle>
              <AlertDescription>
                Tocá Cancelar y completá de nuevo la verificación del formulario.
                Tu actualización elegida se conserva.
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmSubmit} disabled={!canPublish}>
              {isSubmitting ? (
                "Publicando..."
              ) : (
                <>
                  <Send className="mr-2 size-4" />
                  Publicar actualización
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-4" aria-hidden="true" />
              </span>
              ¿Eliminar comentario?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Se eliminará este comentario.</p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedComment?.contenido}
                  </p>
                </div>
                <p className="text-sm font-medium text-destructive">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 size-4" />
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={adminDeleteDialogOpen}
        onOpenChange={setAdminDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-4" aria-hidden="true" />
              </span>
              ¿Eliminar comentario como administrador?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Se eliminará este comentario con permisos de administrador.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border/70 bg-muted/60 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedComment?.contenido}
                  </p>
                  <div className="mt-2 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
                    <span>Autor:</span>
                    <span className="font-medium">
                      {getUsernameFromRelation(selectedComment?.profiles)}
                    </span>
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
              onClick={() => confirmDelete(true)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-2 size-4" />
              Eliminar (Admin)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
