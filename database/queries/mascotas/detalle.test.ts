import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMascotaDetalle, mapPetDetail } from "./detalle"
const q=vi.hoisted(()=>({select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),row:null as any,builder:{} as any}))
vi.mock("@/utils/supabase/public",()=>({createPublicClient:()=>({from:()=>q.builder,storage:{from:()=>({getPublicUrl:(p:string)=>({data:{publicUrl:`https://cdn/${p}`}})})}})}))
beforeEach(()=>{ for(const f of [q.select,q.eq,q.maybeSingle]) f.mockReset().mockReturnValue(q.builder); q.builder={select:q.select,eq:q.eq,maybeSingle:q.maybeSingle}; q.maybeSingle.mockImplementation(async()=>({data:q.row,error:null})); q.row=null })
describe("pet details",()=>{
 it("maps only fields available to public readers",()=>expect(mapPetDetail({id:9,tipo_animal:"gato",estado:"encontrada",descripcion:" Blanca ",telefono:"123",foto_path:"g.jpg",publicada_at:"2026-01-01"},"url")).toMatchObject({species:"Gato",description:"Blanca",status:"Encontrada",phone:"123",image:"url"}))
 it("uses only granted public columns; RLS hides unapproved/retired rows",async()=>{q.row={id:9,tipo_animal:"perro",estado:"perdida",descripcion:"X",telefono:"1",foto_path:"p.webp",publicada_at:"now"}; await getMascotaDetalle(9); expect(q.select).toHaveBeenCalledWith("id,tipo_animal,estado,descripcion,telefono,foto_path,publicada_at"); expect(q.eq).toHaveBeenCalledWith("id",9); expect(q.select.mock.calls[0][0]).not.toMatch(/moderacion_estado|retirada_at/)})
 it("rejects invalid IDs",async()=>expect(getMascotaDetalle(0)).resolves.toMatchObject({data:null}))
})
