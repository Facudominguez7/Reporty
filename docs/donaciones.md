# Donaciones con Mercado Pago

Cualquiera puede donar a Reporty desde `/donar`, con o sin sesión. El pago se hace en
Checkout Pro de Mercado Pago (redirección): Reporty nunca ve datos de tarjeta.

## Flujo

1. **`/donar`**: el donante elige un monto ($1.000 a $20.000, u «Otro» desde $500) y deja
   nombre y mensaje opcionales.
2. **`iniciarDonacionAction`** (`app/donar/actions.ts`) valida los datos y crea una
   preferencia (`POST /checkout/preferences`). Nombre, mensaje y usuario (si hay sesión)
   viajan en `metadata`, junto con `origen: "reporty-donacion"`. La `external_reference`
   es un UUID nuevo.
3. El donante paga en Mercado Pago y vuelve a **`/donar/gracias`**. Esa página consulta
   el pago (`GET /v1/payments/{id}`) y lo registra. Solo muestra el resultado si la
   `external_reference` de la URL coincide con la del pago.
4. Mercado Pago avisa los cambios de estado por **webhook** a
   `/api/donaciones/webhook`. La ruta verifica la firma `x-signature` y vuelve a consultar
   el pago antes de guardar.

Las dos vías terminan en `registrarDonacion` (`lib/donaciones/registro.server.ts`):

- **Registro:** hace un upsert por `pago_id` en `public.donaciones`.
- **Avisos:** si el pago quedó aprobado, manda una sola vez el agradecimiento al donante
  con sesión y el aviso a los admins. La marca es `agradecimiento_enviado_at`.

Una fila existe solo cuando hay un pago real, así que los checkouts abandonados no aparecen.

## Estados

| Mercado Pago | Panel |
| --- | --- |
| `approved` | Aprobada |
| `pending`, `in_process`, `authorized` | Pendiente |
| `rejected`, `cancelled`, `refunded`, `charged_back` | Rechazada |

El estado crudo queda en `estado_mp` y se exporta en el CSV.

## Panel

`/admin/donaciones`, solo para el rol admin, muestra:

- **Totales:** lo aprobado en el mes y lo aprobado en total.
- **Filtros:** por estado y por mes.
- **Tabla:** fecha, monto, estado, nombre, mensaje y usuario.
- **CSV:** `/admin/donaciones/csv` exporta las donaciones con los mismos filtros.

La tabla tiene RLS activado y ninguna política: solo la lee el servidor con service role,
después de verificar el rol admin.

## Configuración

Variables, solo de servidor:

| Variable | Dónde se obtiene |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Tus integraciones › la app › Credenciales. En desarrollo, las de prueba. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Tus integraciones › la app › Webhooks › Clave secreta. |

Webhook en Mercado Pago (Tus integraciones › la app › Webhooks):

- **URL de producción:** `https://reporty.com.ar/api/donaciones/webhook`
- **Evento:** Pagos (`payment`)

En desarrollo, Mercado Pago no llega al servidor local: el pago se registra igual al volver
a `/donar/gracias`.
