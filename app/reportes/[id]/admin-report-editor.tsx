"use client"

import type { ReactNode } from "react"
import { Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { REPORT_IMAGE_ACCEPT_ATTR } from "@/lib/media/report-images"

type AdminInlineFieldProps<Value> = {
  label: string
  value: Value
  editing: boolean
  display: (value: Value) => ReactNode
  editor: (value: Value, onChange: (value: Value) => void) => ReactNode
  onChange: (value: Value) => void
  disabled?: boolean
  className?: string
}

export function AdminInlineField<Value>({ label, value, editing, display, editor, onChange, disabled = false, className }: AdminInlineFieldProps<Value>) {
  return (
    <div className={className}>
      {editing ? (
        <fieldset disabled={disabled} className={`m-0 min-w-0 space-y-1.5 border-0 p-0 ${disabled ? "pointer-events-none opacity-70" : ""}`}>
          <legend className="block text-xs font-medium text-muted-foreground">{label}</legend>
          {editor(value, onChange)}
        </fieldset>
      ) : (
        <div className="min-w-0">{display(value)}</div>
      )}
    </div>
  )
}

type AdminReportEditActionsProps = {
  saving: boolean
  onSave: () => void
  onCancel: () => void
  errorMessage?: string | null
}

export function AdminReportEditActions({ saving, onSave, onCancel, errorMessage }: AdminReportEditActionsProps) {
  return (
    <div role="group" aria-label="Acciones de edición del reporte" className="flex flex-wrap justify-end gap-2 rounded-xl border border-border/70 bg-card p-3">
      {errorMessage && <p role="alert" className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{errorMessage}</p>}
      <Button type="button" onClick={onSave} disabled={saving} className="min-h-10">
        <Save className="size-4" />
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="min-h-10">
        Cancelar
      </Button>
    </div>
  )
}

export type AdminReportPhotoDraft = {
  file: File | null
  remove: boolean
  version: number
}

type AdminReportPhotoControlsProps = {
  fotoId: number
  index: number
  draft: AdminReportPhotoDraft
  onChange: (draft: AdminReportPhotoDraft) => void
  disabled?: boolean
}

export function AdminReportPhotoControls({ fotoId, index, draft, onChange, disabled = false }: AdminReportPhotoControlsProps) {
  const inputId = `replace-photo-${fotoId}`

  return (
    <div className="mt-2 min-w-0 space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-xs">Reemplazar foto {index + 1}</Label>
        <Input
          key={draft.version}
          id={inputId}
          type="file"
          accept={REPORT_IMAGE_ACCEPT_ATTR}
          className="min-h-10 min-w-0 text-xs"
          disabled={disabled}
          onChange={(event) => onChange({ ...draft, file: event.target.files?.[0] ?? null, remove: false })}
        />
        {draft.file && <p className="break-all text-xs text-muted-foreground">Seleccionada: {draft.file.name}</p>}
      </div>
      <Button
        type="button"
        variant={draft.remove ? "outline" : "destructive"}
        className="min-h-10"
        disabled={disabled}
        aria-pressed={draft.remove}
        aria-label={draft.remove ? `Conservar foto ${index + 1}` : `Quitar foto ${index + 1}`}
        onClick={() => onChange({ file: null, remove: !draft.remove, version: draft.version + 1 })}
      >
        <Trash2 className="size-4" />
        {draft.remove ? "Conservar foto" : "Quitar foto"}
      </Button>
      {draft.remove && <p role="status" className="text-xs text-muted-foreground">Se quitará al guardar los cambios.</p>}
    </div>
  )
}
