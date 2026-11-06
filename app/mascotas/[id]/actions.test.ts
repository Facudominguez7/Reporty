import { beforeEach,describe,expect,it,vi } from "vitest"
const {createClient,getUser,rpc,revalidatePath}=vi.hoisted(()=>({createClient:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),revalidatePath:vi.fn()}))
vi.mock("@/utils/supabase/server",()=>({createClient}))
vi.mock("next/cache",()=>({revalidatePath}))
vi.mock("../nueva/actions",()=>({retirarMascotaPropiaAction:vi.fn()}))
import {marcarMascotaEncontradaAction} from "./actions"
beforeEach(()=>{vi.clearAllMocks();createClient.mockResolvedValue({auth:{getUser},rpc});getUser.mockResolvedValue({data:{user:{id:"owner",is_anonymous:false}},error:null});rpc.mockResolvedValue({data:true,error:null})})
describe("mark pet found",()=>{it("uses authenticated session RPC and revalidates on success",async()=>{expect(await marcarMascotaEncontradaAction(4)).toEqual({success:true});expect(rpc).toHaveBeenCalledWith("marcar_mascota_encontrada",{p_mascota_id:4});expect(revalidatePath).toHaveBeenCalledWith("/mascotas/4")});it("rejects unauthenticated users",async()=>{getUser.mockResolvedValueOnce({data:{user:null},error:null});expect(await marcarMascotaEncontradaAction(4)).toMatchObject({success:false});expect(rpc).not.toHaveBeenCalled()});it("reports rejected one-way transitions",async()=>{rpc.mockResolvedValueOnce({data:false,error:null});expect(await marcarMascotaEncontradaAction(4)).toMatchObject({success:false});expect(revalidatePath).not.toHaveBeenCalled()})})
