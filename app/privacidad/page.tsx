import type { Metadata } from "next"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { ContactEmail, LegalDocument, type LegalSection } from "@/components/legal/legal-document"
import { LEGAL_RESPONSABLES } from "@/lib/legal/info"
import { pageMetadata } from "@/lib/seo/site"

export const metadata: Metadata = pageMetadata({
  title: "Política de privacidad",
  description:
    "Qué datos recolecta Reporty, qué se publica, con quién se comparten y cómo ejercer tus derechos según la Ley 25.326 de protección de datos personales.",
  path: "/privacidad",
})

const sections: LegalSection[] = [
  {
    id: "responsables",
    title: "Quiénes son los responsables",
    content: (
      <>
        <p>
          Reporty es una plataforma ciudadana independiente para reportar y seguir problemas urbanos en Posadas, Misiones.
          Los responsables de la base de datos son <strong>{LEGAL_RESPONSABLES.join(" y ")}</strong>, con domicilio en
          Posadas, Misiones, República Argentina.
        </p>
        <p>
          Para cualquier consulta sobre tus datos personales podés escribir a <ContactEmail />.
        </p>
      </>
    ),
  },
  {
    id: "datos",
    title: "Qué datos recolectamos",
    content: (
      <ul>
        <li>
          <strong>Datos de tu cuenta:</strong> email, nombre de usuario y contraseña. La contraseña la guarda cifrada nuestro
          proveedor de autenticación: nadie del equipo puede verla. Si entrás como invitado, se crea una cuenta sin email que
          podés vincular a uno más adelante.
        </li>
        <li>
          <strong>Tus reportes y mascotas:</strong> título, descripción, categoría, prioridad, la ubicación que marcás en el
          mapa, las fotos que subís y, en mascotas, el teléfono de contacto que elegís publicar.
        </li>
        <li>
          <strong>Tu participación:</strong> comentarios, votos y los puntos que sumás al participar.
        </li>
        <li>
          <strong>Tus donaciones:</strong> monto, fecha, estado del pago y número de operación de Mercado Pago; el nombre y el
          mensaje si los dejás, y tu usuario si donaste con la sesión iniciada.
        </li>
        <li>
          <strong>Uso del sitio:</strong> páginas visitadas, tipo de dispositivo, navegador y ciudad aproximada, medidos con
          Google Analytics.
        </li>
        <li>
          <strong>Registros técnicos y de seguridad:</strong> por ejemplo, los intentos de envío de reportes, que usamos para
          frenar abusos.
        </li>
      </ul>
    ),
  },
  {
    id: "publico",
    title: "Qué información es pública",
    content: (
      <>
        <p>
          Reporty funciona porque los reportes se ven. Cualquier persona, tenga o no cuenta, puede ver{" "}
          <strong>tus reportes con su ubicación exacta y sus fotos</strong>, tu nombre de usuario como autor, tus comentarios, y
          tus puntos y tu posición en el ranking de la comunidad. Si publicás una mascota, también se ven su foto, la zona
          donde se perdió o se encontró y el teléfono que elegiste mostrar.
        </p>
        <p>
          Quien sube una foto es responsable de su contenido, como explican los{" "}
          <Link href="/terminos#fotos" className="font-medium text-primary underline-offset-4 hover:underline">
            términos y condiciones
          </Link>
          . Las donaciones no son públicas: el monto, el nombre y el mensaje solo los ven los administradores. Tu email nunca se muestra. Te pedimos que no incluyas datos personales tuyos ni de otras personas en los textos o en
          las fotos: rostros reconocibles, patentes, nombres, teléfonos o domicilios particulares.
        </p>
      </>
    ),
  },
  {
    id: "usos",
    title: "Para qué usamos tus datos",
    content: (
      <ul>
        <li>Mostrar los reportes en el mapa, en el listado y en su página de detalle.</li>
        <li>Crear y mantener tu cuenta, y permitirte comentar, votar y sumar puntos.</li>
        <li>Avisarte por email cuando comentan tus reportes o cuando cambia su estado.</li>
        <li>Registrar las donaciones y, si donaste con tu cuenta, mandarte un email de agradecimiento.</li>
        <li>Prevenir abusos, reportes falsos y usos indebidos de la plataforma, incluida la revisión de las fotos.</li>
        <li>Entender cómo se usa el sitio para mejorarlo.</li>
      </ul>
    ),
  },
  {
    id: "terceros",
    title: "Con quién compartimos datos",
    content: (
      <>
        <p>
          No vendemos tus datos ni los usamos para publicidad. Para que Reporty funcione trabajamos con estos proveedores, que
          los tratan por cuenta nuestra:
        </p>
        <ul>
          <li>
            <strong>Supabase:</strong> base de datos, autenticación y almacenamiento de las fotos.
          </li>
          <li>
            <strong>Hostinger:</strong> alojamiento del sitio.
          </li>
          <li>
            <strong>Resend:</strong> envío de los emails de aviso y de acceso a tu cuenta.
          </li>
          <li>
            <strong>Mercado Pago:</strong> procesamiento de las donaciones. Los datos de pago los tratás directamente con Mercado
            Pago, según su propia política de privacidad.
          </li>
          <li>
            <strong>Sightengine:</strong> análisis automático de las fotos que subís para detectar desnudos, armas, violencia o
            contenido gráfico antes de publicarlas.
          </li>
          <li>
            <strong>Google Analytics:</strong> medición del uso del sitio.
          </li>
        </ul>
        <p>
          Algunos de estos proveedores guardan o procesan datos fuera de la Argentina. Al usar Reporty prestás tu
          consentimiento para esa transferencia. Además, podemos entregar datos cuando lo exija una autoridad competente
          conforme a la ley.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    content: (
      <>
        <p>Usamos dos tipos de cookies:</p>
        <ul>
          <li>
            <strong>Necesarias:</strong> mantienen tu sesión iniciada. Sin ellas no podés usar tu cuenta.
          </li>
          <li>
            <strong>De medición:</strong> las de Google Analytics, que cuentan visitas de forma agregada.
          </li>
        </ul>
        <p>
          Podés borrar o bloquear las cookies desde la configuración de tu navegador, o desactivar solo Google Analytics con
          su{" "}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            className="font-medium text-primary underline-offset-4 hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            complemento de inhabilitación
          </a>
          .
        </p>
      </>
    ),
  },
  {
    id: "conservacion",
    title: "Cuánto tiempo guardamos los datos",
    content: (
      <>
        <p>Guardamos los datos de tu cuenta mientras la tengas.</p>
        <p>
          Cuando eliminás un reporte, deja de verse de inmediato, pero lo conservamos en nuestra base de datos como registro y
          para prevenir abusos. Si querés que lo borremos de forma definitiva, escribinos a <ContactEmail />.
        </p>
        <p>
          Podés eliminar tu cuenta cuando quieras desde la app: se borran tus datos y todo lo que publicaste. En{" "}
          <Link href="/eliminar-cuenta">Eliminar tu cuenta</Link> explicamos los pasos y qué datos se conservan.
        </p>
        <p>
          Si una foto o un texto se elimina por no cumplir los términos, podemos conservarlo junto con los datos asociados
          cuando haya indicios de un delito o lo pida una autoridad competente.
        </p>
      </>
    ),
  },
  {
    id: "derechos",
    title: "Tus derechos",
    content: (
      <>
        <p>
          Podés pedir <strong>acceder</strong> a tus datos, <strong>corregirlos</strong>, <strong>actualizarlos</strong> o{" "}
          <strong>suprimirlos</strong>. Escribinos a <ContactEmail /> desde el email de tu cuenta, o contanos cómo
          identificarte si usás una cuenta de invitado.
        </p>
        <p>
          Respondemos los pedidos de acceso dentro de los diez días corridos, y los de corrección o supresión dentro de los
          cinco días hábiles, como establece la Ley N° 25.326.
        </p>
        <p className="rounded-[var(--radius)] border bg-muted/60 p-4 text-sm leading-6">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita
          a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido
          en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de
          Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
          quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de
          datos personales.
        </p>
      </>
    ),
  },
  {
    id: "seguridad",
    title: "Cómo protegemos tus datos",
    content: (
      <p>
        El sitio funciona solo con conexiones cifradas (HTTPS), las contraseñas nunca se guardan en texto plano y la base de
        datos restringe qué puede leer o modificar cada cuenta. Ningún sistema es infalible: si detectamos un incidente que
        afecte tus datos, te vamos a avisar.
      </p>
    ),
  },
  {
    id: "menores",
    title: "Menores de edad",
    content: (
      <p>
        Reporty no está pensado para menores de 13 años. Si tenés entre 13 y 17 años, usalo con la autorización de tu madre,
        padre o tutor.
      </p>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en esta política",
    content: (
      <p>
        Si cambiamos esta política, vamos a publicar la nueva versión en esta página con su fecha de actualización. Si el
        cambio es importante, también lo vamos a avisar en el sitio. Te recomendamos leerla junto con los{" "}
        <Link href="/terminos" className="font-medium text-primary underline-offset-4 hover:underline">
          términos y condiciones
        </Link>
        .
      </p>
    ),
  },
]

export default function PrivacidadPage() {
  return (
    <LegalDocument
      icon={<ShieldCheck className="size-4" />}
      title="Política de privacidad"
      description="Qué datos usamos, qué se publica y cómo ejercer tus derechos."
      summary={
        <>
          <p>
            Tus reportes, con su ubicación y sus fotos, son públicos: así funciona Reporty. Tu email nunca se muestra.
          </p>
          <p>
            No vendemos tus datos ni mostramos publicidad. Podés pedir verlos, corregirlos o borrarlos cuando quieras
            escribiendo a <ContactEmail />.
          </p>
        </>
      }
      sections={sections}
    />
  )
}
