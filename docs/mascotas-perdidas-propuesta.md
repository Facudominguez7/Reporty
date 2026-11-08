# Propuesta: mascotas perdidas en Reporty

Agregar publicaciones de mascotas perdidas a Reporty reutilizando la experiencia y la infraestructura existente, pero sin mezclarlas con los incidentes urbanos. La primera versión permite explorarlas en mapa y listado, publicarlas, marcarlas encontradas y compartirlas; no incorpora chat ni un flujo de avistamientos.

## Navegación y creación

- Al presionar **Crear** en la barra de navegación inferior, abrir una nueva página de selección con dos botones relativamente grandes, uno para **Crear reporte/incidencia** y otro para **Cargar mascota perdida**. En mobile, apilarlos verticalmente; en desktop, ubicarlos uno al lado del otro. El primero lleva al flujo existente para crear un reporte (`/reportes/nuevo`); el segundo lleva a una página nueva con el formulario de publicación de mascota.
- El formulario de mascota debe ser similar al formulario de reportes existente y reutilizar sus patrones donde corresponda.
- Mantener en las páginas nuevas el formato visual existente del sistema: estilos, espaciado, botones, títulos y componentes compartidos. Revisar como referencia las páginas `/reportes`, `/auth` y `/comunidad`, y reutilizar el componente `PageTitleBar`.
- En `/mapa`, centrar en la parte superior el selector **Reportes / Mascotas**, que cambia la capa visible. El botón flotante **+** debe ofrecer dos acciones: crear reporte/incidencia o cargar mascota perdida, cada una con su flujo correspondiente.
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
- Solo una persona con cuenta registrada puede publicar una mascota perdida. Después de publicar, la persona autora no puede editar sus datos; solo puede marcarla como **Encontrada** (con un modal de confirmación) o retirar la publicación. El cambio de **Perdida** a **Encontrada** es unidireccional para la autora; administración puede editar la publicación completa, corregir el estado o retirarla.
- Las mascotas encontradas siguen visibles sin vencimiento automático hasta que quien la publicó o administración retire la publicación. El retiro de la autora debe seguir el comportamiento existente de retiro de reportes, sujeto a verificar cómo funciona actualmente.
- No permitir que cualquier visitante cambie el estado. No reutilizar **Reparado** ni el voto **No existe**.
- Mantener moderación y retiro administrativo, adaptando los controles y textos que hoy dependen de reportes.
- La comunidad se mantiene compartida para reportes y mascotas; por ahora no diferenciar publicaciones de mascotas en una comunidad separada.
- Publicar una mascota otorga los mismos puntos que crear un reporte. Marcarla como **Encontrada** no otorga puntos adicionales. Si administración retira una publicación por moderación, revertir los puntos de creación siguiendo la misma regla que los reportes.

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

## Límites técnicos a considerar

El flujo actual de imágenes y algunas notificaciones están ligados a reportes urbanos; conviene reutilizar sus piezas desacopladas, no duplicar sus supuestos de categoría y estado. La consulta actual del mapa filtra reportes pendientes, por lo que la consulta de mascotas debe ser independiente y mostrar ambos estados. La tabla nueva y sus políticas de acceso deben proteger cambios de autoría/estado y exponer claramente que el teléfono es público.
