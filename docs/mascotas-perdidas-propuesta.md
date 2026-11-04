# Propuesta: mascotas perdidas en Reporty

Agregar publicaciones de mascotas perdidas a Reporty reutilizando la experiencia y la infraestructura existente, pero sin mezclarlas con los incidentes urbanos. La primera versión permite explorarlas en mapa y listado, publicarlas, marcarlas encontradas y compartirlas; no incorpora chat ni un flujo de avistamientos.

## Navegación y creación

- En el encabezado, **Crear** abre una elección: **Reportar un incidente** lleva a `/reportes/nuevo`; **Reportar una mascota perdida** lleva al formulario propio de mascotas.
- En `/mapa`, el selector **Reportes / Mascotas** cambia la capa visible. El botón de creación se adapta a la pestaña activa y abre el formulario correspondiente.
- En el listado de `/reportes`, sumar pestañas **Incidentes / Mascotas**. Incidentes conserva su listado y filtros actuales; Mascotas muestra publicaciones de mascotas con su consulta y filtros propios. No combinar ambos tipos en una misma lista.
- Las cards compactas de mascotas reutilizan casi el diseño de las cards actuales: foto, encabezado corto, fecha de publicación, descripción resumida y tags de tipo de animal y estado. El encabezado se genera con tipo y estado —por ejemplo, **Perro perdido**—; no se pide el nombre de la mascota. No mostrar categoría ni prioridad de incidente.

## Experiencia en el mapa

- En la pestaña **Mascotas**, mostrar marcadores **Perdida** y **Encontrada**. Las encontradas permanecen visibles.
- Al tocar un marcador, abrir una ficha breve con foto, especie, descripción, estado, fecha de publicación y teléfono de contacto.
- Incluir **Compartir** y un enlace estable que vuelva a abrir la ficha de esa mascota.
- Reutilizar el mapa, los marcadores donde encajen, el selector existente de ubicación, botones, alertas y confirmaciones. Adaptar textos y datos para no presentar una mascota como reporte urbano.

## Publicación

| Campo | Regla propuesta |
|---|---|
| Foto | Requerida; reutilizar el procesamiento y la moderación de imágenes si pueden desacoplarse del flujo urbano. |
| Tipo de animal | Requerido: perro, gato u otro; se usa también para generar el encabezado de la card junto con el estado. |
| Descripción | Requerida; permite incluir color, tamaño, collar y señas particulares. |
| Última ubicación conocida | Requerida; seleccionar el punto con el selector de mapa existente. |
| Teléfono de contacto | Requerido y público; explicar antes de publicar que cualquier visitante podrá verlo y llamar o escribir. |
| Fecha de publicación | Automática, como en los reportes actuales. |
| Estado inicial | **Perdida**, asignado automáticamente. |

No pedir nombre de la mascota ni una fecha separada de pérdida.

## Gestión y permisos

- Mantener mascotas en datos propios, separados de `reportes`, prioridades, votos y cuadrillas. La pestaña de mascotas del listado tiene filtros propios —tipo de animal y estado— y no altera los filtros de incidentes.
- La publicación es pública mientras no se retire. El teléfono también es público por decisión de quien publica.
- Quien publicó puede cambiar el estado de **Perdida** a **Encontrada**; administración puede editar la publicación completa, cambiar el estado o retirarla, igual que gestiona los reportes.
- No permitir que cualquier visitante cambie el estado. No reutilizar **Reparado** ni el voto **No existe**.
- Mantener moderación y retiro administrativo, adaptando los controles y textos que hoy dependen de reportes.

## Interacciones y avisos

- **Compartir:** ofrecer el botón en la ficha y generar un enlace directo a esa mascota.
- **Contacto:** los avisos de avistamiento se resuelven por teléfono en esta primera versión; no agregar comentarios ni chat.
- **Correo:** usar plantillas y envío existentes con textos específicos de mascotas, no los mensajes de “reporte reparado”. Avisar sobre cambios relevantes de estado o retiro administrativo cuando la cuenta del autor tenga correo disponible. No enviar un correo por cada edición.
- Reutilizar alertas y confirmaciones existentes para errores, acciones y cambios de estado, adaptando el contenido.

## Fuera del primer alcance

- Comentarios, votos, opción “No existe”, chat y reportes de avistamientos.
- Cuadrillas, prioridades y estados municipales.
- Incluir búsquedas de mascotas en métricas de reparación o desempeño municipal.
- Nombre de mascota y fecha de pérdida como campos separados.

## Decisiones por cerrar antes de implementar

1. **Publicación por invitados:** los reportes actuales admiten invitados, pero hay que definir cómo se demuestra la autoría para que solo quien publicó pueda marcar la mascota como encontrada. Administración siempre conserva su capacidad de gestión.
2. **Correo para invitados:** si se permiten, definir si se pide correo además del teléfono o si las notificaciones quedan disponibles solo para cuentas con email.
3. **Retiro de la publicación:** acordar el comportamiento de una mascota encontrada en el mapa a largo plazo. En la primera versión debe seguir visible, tal como se acordó.

## Límites técnicos a considerar

El flujo actual de imágenes y algunas notificaciones están ligados a reportes urbanos; conviene reutilizar sus piezas desacopladas, no duplicar sus supuestos de categoría y estado. La consulta actual del mapa filtra reportes pendientes, por lo que la consulta de mascotas debe ser independiente y mostrar ambos estados. La tabla nueva y sus políticas de acceso deben proteger cambios de autoría/estado y exponer claramente que el teléfono es público.
