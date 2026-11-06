"use server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { procesarAvisosMascota } from "@/lib/moderation/avisos-mascotas.server"
import { retirarMascotaPropiaAction } from "../nueva/actions"
export async function marcarMascotaEncontradaAction(id:number) {
 if(!Number.isSafeInteger(id)||id<=0)return {success:false as const,error:"La publicación no está disponible."}
 try { const session=await createClient(); const {data:{user},error:authError}=await session.auth.getUser(); if(authError||!user||user.is_anonymous)return {success:false as const,error:"Necesitás una cuenta registrada para actualizar la publicación."}; const {data,error}=await session.rpc("marcar_mascota_encontrada",{p_mascota_id:id}); if(error||data!==true)return {success:false as const,error:"No pudimos marcar la mascota como encontrada. Puede que ya esté encontrada o no te pertenezca."}; revalidatePath(`/mascotas/${id}`); try { await procesarAvisosMascota(createAdminClient(), id) } catch { /* The committed outbox is retried separately. */ } return {success:true as const} } catch {return {success:false as const,error:"No pudimos marcar la mascota como encontrada."}}
}
export async function retirarMascotaDetalleAction(id:number){const result=await retirarMascotaPropiaAction(id); if(result.success)revalidatePath(`/mascotas/${id}`); return result}
