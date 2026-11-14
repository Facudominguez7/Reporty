import type { Metadata } from "next"
import Link from "next/link"
import { ScrollText } from "lucide-react"

import { ContactEmail, LegalDocument, type LegalSection } from "@/components/legal/legal-document"
import { LEGAL_RESPONSABLES } from "@/lib/legal/info"
import { pageMetadata } from "@/lib/seo/site"

export const metadata: Metadata = pageMetadata({
  title: "Términos y condiciones",
  description:
    "Las reglas para usar Reporty: qué se puede publicar, qué pasa con tu contenido, cómo funcionan la moderación, los puntos y las donaciones.",
  path: "/terminos",
})

const linkClassName = "font-medium text-primary underline-offset-4 hover:underline"

const sections: LegalSection[] = [
  {
    id: "que-es",
    title: "Qué es Reporty",
    content: (
      <>
        <p>
          Reporty es una plataforma ciudadana independiente, creada por {LEGAL_RESPONSABLES.join(" y ")}, para que vecinas y
          vecinos reporten problemas de la vía pública de Posadas, Misiones, y sigan cómo avanzan.
        </p>
        <p>
          <strong>Reporty no es un canal oficial de la Municipalidad de Posadas</strong> ni de ningún otro organismo público.
          Un reporte no reemplaza un reclamo formal ante la autoridad que corresponda.{" "}
          <strong>Ante una emergencia, llamá al 911.</strong>
        </p>
      </>
    ),
  },
  {
    id: "aceptacion",
    title: "Aceptación",
    content: (
      <p>
        Al crear una cuenta o usar Reporty, también como invitado, aceptás estos términos y la{" "}
        <Link href="/privacidad" className={linkClassName}>
          política de privacidad
        </Link>
        . Si no estás de acuerdo, no uses la plataforma.
      </p>
    ),
  },
  {
    id: "cuenta",
    title: "Tu cuenta",
    content: (
      <ul>
        <li>Usá datos reales y cuidá tu contraseña: lo que se haga con tu cuenta es tu responsabilidad.</li>
        <li>
          Tu nombre de usuario se crea automáticamente al registrarte y es público: se muestra en tus reportes, tus
          comentarios y el ranking. Si entrás con Google, se arma a partir del nombre de tu cuenta de Google; si te registrás
          con email, a partir de la parte de tu email que está antes de la «@» (el resto de tu email nunca se muestra). Se
          escribe en minúsculas y sin tildes, y si ya existe se le agrega un número. Podés cambiarlo cuando quieras desde{" "}
          <Link href="/dashboard" className={linkClassName}>
            Mi cuenta
          </Link>
          .
        </li>
        <li>Tu nombre de usuario no puede ser ofensivo ni hacerse pasar por otra persona o por un organismo.</li>
        <li>Una cuenta es personal. No crees cuentas para inflar votos o puntos.</li>
      </ul>
    ),
  },
  {
    id: "contenido-permitido",
    title: "Qué podés publicar",
    content: (
      <>
        <p>
          Reportá problemas reales de la vía pública, con su ubicación y con fotos tomadas por vos, y publicá mascotas
          perdidas o encontradas con datos reales. <strong>No está permitido</strong> publicar:
        </p>
        <ul>
          <li>Reportes falsos, inventados o hechos para molestar.</li>
          <li>Contenido ofensivo, discriminatorio, violento, sexual o que incite a cometer delitos.</li>
          <li>
            Datos personales de otras personas: rostros reconocibles, patentes, nombres, teléfonos o domicilios particulares.
          </li>
          <li>Publicidad, spam o contenido que no tenga relación con problemas urbanos.</li>
          <li>Fotos o textos de terceros sin su permiso.</li>
        </ul>
      </>
    ),
  },
  {
    id: "fotos",
    title: "Fotos y responsabilidad por lo que publicás",
    content: (
      <>
        <p>
          <strong>Sos el único responsable de las fotos y los textos que subís</strong>, en reportes, mascotas, comentarios
          o cualquier otra parte de Reporty. Al subirlos declarás que los tomaste vos o que tenés permiso para publicarlos, y
          que no violan la ley ni derechos de otras personas.
        </p>
        <p>Además de lo indicado en «Qué podés publicar», está prohibido subir:</p>
        <ul>
          <li>Contenido ilegal o que muestre, promueva o facilite un delito.</li>
          <li>Desnudos, contenido sexual o cualquier imagen sexualizada de menores de edad.</li>
          <li>Violencia explícita, contenido sangriento, armas usadas para amenazar o imágenes que humillen a alguien.</li>
          <li>Fotos de otras personas sin su consentimiento, sobre todo de niñas, niños y adolescentes.</li>
          <li>Imágenes protegidas por derechos de autor o marcas que no te pertenecen.</li>
        </ul>
        <p>
          Las fotos pasan por un control automático y pueden ser revisadas por un administrador antes o después de
          publicarse. Ese control ayuda, pero Reporty no garantiza que todo el contenido publicado por usuarios sea adecuado
          ni responde por él: la responsabilidad es de quien lo subió.
        </p>
        <p>
          Si publicás algo que no cumple estas reglas, podemos rechazarlo o eliminarlo sin aviso y suspender tu cuenta.
          Cuando haya indicios de un delito, o lo pida una autoridad competente, podemos conservar ese contenido y los datos
          asociados y entregarlos conforme a la ley. Si un tercero reclama por algo que publicaste, la responsabilidad frente
          a ese reclamo es tuya.
        </p>
        <p>
          Si ves una foto o un texto que no cumple estas reglas, avisanos a <ContactEmail /> y lo revisamos.
        </p>
      </>
    ),
  },
  {
    id: "tu-contenido",
    title: "Qué pasa con lo que publicás",
    content: (
      <p>
        Lo que publicás sigue siendo tuyo. Al publicarlo nos das permiso, gratuito y no exclusivo, para mostrarlo en Reporty,
        adaptarlo para que se vea bien (por ejemplo, comprimir las fotos) y mantenerlo publicado. Los reportes, los comentarios
        y tu nombre de usuario son públicos, como explica la{" "}
        <Link href="/privacidad" className={linkClassName}>
          política de privacidad
        </Link>
        .
      </p>
    ),
  },
  {
    id: "moderacion",
    title: "Moderación y estado de los reportes",
    content: (
      <>
        <p>
          El estado de un reporte puede cambiar por los votos de la comunidad o por decisión de un administrador. Los
          administradores pueden ocultar o eliminar contenido y suspender cuentas que no cumplan estos términos, sin aviso
          previo cuando el caso lo justifique.
        </p>
        <p>
          Si ves contenido que no cumple estas reglas, o creés que un reporte tuyo se moderó por error, escribinos a{" "}
          <ContactEmail />.
        </p>
      </>
    ),
  },
  {
    id: "puntos",
    title: "Puntos y ranking",
    content: (
      <p>
        Los puntos reconocen tu participación. No tienen valor económico, no se pueden canjear ni transferir, y podemos
        ajustarlos o anularlos si detectamos abusos.
      </p>
    ),
  },
  {
    id: "donaciones",
    title: "Donaciones",
    content: (
      <>
        <p>
          Las donaciones son voluntarias: Reporty es gratis y lo seguirá siendo, dones o no. Lo que donás se usa para mantener
          la plataforma: servidores, mapas y envío de avisos.
        </p>
        <ul>
          <li>
            El pago se hace en Mercado Pago, con sus propios términos. Reporty no ve ni guarda los datos de tu tarjeta o de tu
            cuenta de Mercado Pago.
          </li>
          <li>
            Donar no da derecho a nada a cambio: las donaciones no dan puntos, no cambian la prioridad de tus reportes ni dan
            acceso a funciones especiales.
          </li>
          <li>
            Reporty es una iniciativa ciudadana, no una organización sin fines de lucro registrada: no emitimos recibos de
            donación y las donaciones no son deducibles de impuestos.
          </li>
          <li>
            El nombre y el mensaje que dejes son opcionales y solo los ven los administradores, como explica la{" "}
            <Link href="/privacidad" className={linkClassName}>
              política de privacidad
            </Link>
            .
          </li>
          <li>
            Si donaste por error o el monto no es el que querías, escribinos a <ContactEmail /> con el número de operación de
            Mercado Pago y vemos cómo devolverlo.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "responsabilidad",
    title: "Alcance del servicio",
    content: (
      <ul>
        <li>Reporty es gratuito y se ofrece tal como está. Puede tener interrupciones o errores.</li>
        <li>No garantizamos que un problema reportado se resuelva, ni en qué plazo.</li>
        <li>
          Cada persona es responsable de lo que publica. No respondemos por la exactitud de los reportes ni por el contenido
          que publican otras personas.
        </li>
      </ul>
    ),
  },
  {
    id: "cambios",
    title: "Cambios en estos términos",
    content: (
      <p>
        Podemos actualizar estos términos. La versión vigente es siempre la que está publicada en esta página, con su fecha
        de actualización. Si seguís usando Reporty después de un cambio, aceptás la nueva versión.
      </p>
    ),
  },
  {
    id: "ley",
    title: "Ley aplicable y contacto",
    content: (
      <p>
        Estos términos se rigen por las leyes de la República Argentina. Salvo que la ley disponga otra cosa, cualquier
        conflicto se resolverá ante los tribunales ordinarios de la ciudad de Posadas, Misiones. Para cualquier consulta,
        escribinos a <ContactEmail />.
      </p>
    ),
  },
]

export default function TerminosPage() {
  return (
    <LegalDocument
      icon={<ScrollText className="size-4" />}
      title="Términos y condiciones"
      description="Las reglas para usar Reporty y cuidar la comunidad."
      summary={
        <>
          <p>
            Reportá problemas reales de la vía pública, sin datos personales de otras personas. Lo que publicás es público y
            sos responsable de las fotos y los textos que subís.
          </p>
          <p>
            Reporty es una iniciativa ciudadana: no es un canal oficial de la Municipalidad ni atiende emergencias.
          </p>
        </>
      }
      sections={sections}
    />
  )
}
