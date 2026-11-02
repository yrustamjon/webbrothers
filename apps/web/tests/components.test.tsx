import {describe,it,expect,vi,beforeEach} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Auth,Explorer,Pairing} from '../src/App';
import {useSelection} from '../src/store';
const response=(value:unknown,status=200)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}));
function mount(element:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{element}</QueryClientProvider>);}
const device={id:'d1',display_name:'Ish kompyuteri',operating_system:'linux',architecture:'amd64',status:'online',scopes:['browser.discovery','history.read']};
beforeEach(()=>{useSelection.getState().clear();vi.restoreAllMocks();});
describe('haqiqiy komponent oʻzaro taʼsirlari',()=>{
 it('kirish autentifikatsiyasiz CSRF chaqirmaydi va parolni yuboradi',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(()=>response({email:'user@example.com'}));const done=vi.fn();mount(<Auth onLogin={done}/>);const user=userEvent.setup();await user.type(screen.getByLabelText('Elektron pochta'),'user@example.com');await user.type(screen.getByLabelText('Parol'),'very-long-password');await user.click(screen.getByRole('button',{name:'Kirish',exact:true}));await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/login');expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({email:'user@example.com',password:'very-long-password'});
 });
 it('kirish xatosi oʻzbekcha koʻrsatiladi',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(()=>response({detail:'Parol notoʻgʻri.'},401));mount(<Auth onLogin={vi.fn()}/>);const user=userEvent.setup();await user.type(screen.getByLabelText('Elektron pochta'),'user@example.com');await user.type(screen.getByLabelText('Parol'),'very-long-password');await user.click(screen.getByRole('button',{name:'Kirish',exact:true}));expect(await screen.findByRole('alert')).toHaveTextContent('Parol notoʻgʻri.');
 });
 it('faqat bitta brauzer ochiladi, profil va tarix filtrlari agentga yuboriladi',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation((url,options)=>{
   if(String(url).endsWith('/auth/csrf'))return response({csrf_token:'csrf'});
   const body=JSON.parse(options?.body as string);if(body.type==='BROWSER_LIST_REQUEST')return response({payload:{items:[{id:'chrome',name:'Chrome',profiles:[{id:'p1',name:'Shaxsiy'}]},{id:'firefox',name:'Firefox',profiles:[{id:'p2',name:'Ish'}]}]}});
   return response({payload:{items:[],page:1,page_size:25,total:0}});
  });mount(<Explorer device={device}/>);const user=userEvent.setup();const chrome=await screen.findByRole('button',{name:/Chrome/});await user.click(chrome);expect(chrome).toHaveAttribute('aria-expanded','true');await user.click(screen.getByRole('button',{name:/Firefox/}));expect(chrome).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('button',{name:'Shaxsiy'})).not.toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Ish',exact:true}));await screen.findByText('Tanlangan filtrlarda tarix topilmadi.');await user.type(screen.getByLabelText('URL, sarlavha yoki domen'),'example');await user.click(screen.getByRole('button',{name:'Qidirish',exact:true}));await waitFor(()=>expect(fetchMock.mock.calls.some(([,opts])=>{if(!opts?.body)return false;const b=JSON.parse(String(opts.body));return b.type==='HISTORY_QUERY'&&b.params.profile_id==='p2'&&b.params.search==='example';})).toBe(true));
 });
 it('ulash faqat aniq tanlangan ruxsatlarni yuboradi',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(url=>String(url).endsWith('/auth/csrf')?response({csrf_token:'csrf'}):response({status:'approved'}));const done=vi.fn();mount(<Pairing onDone={done}/>);const user=userEvent.setup();const approve=screen.getByRole('button',{name:'Ulashni tasdiqlash'});expect(approve).toBeDisabled();await user.type(screen.getByLabelText('Ulash kodi'),'AABBCCDDEEFF');await user.click(screen.getByRole('checkbox',{name:'Brauzerlarni aniqlash'}));await user.click(approve);await waitFor(()=>expect(done).toHaveBeenCalledOnce());const call=fetchMock.mock.calls.find(([url])=>String(url).endsWith('/pairing/approve'));expect(JSON.parse(String(call?.[1]?.body))).toEqual({code:'AABBCCDDEEFF',scopes:['browser.discovery']});expect(call?.[1]?.headers).toMatchObject({'X-CSRF-Token':'csrf'});
 });
 it('offline qurilma agentga soʻrov yubormaydi',()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch');mount(<Explorer device={{...device,status:'offline'}}/>);expect(screen.getByRole('status')).toHaveTextContent('Qurilma ulanmagan');expect(fetchMock).not.toHaveBeenCalled();
 });
 it('agent ruxsat xatosi interfeysda yashirilmaydi',async()=>{
  vi.spyOn(globalThis,'fetch').mockImplementation(url=>String(url).endsWith('/auth/csrf')?response({csrf_token:'csrf'}):response({detail:'Ruxsat berilmagan.'},403));mount(<Explorer device={device}/>);expect(await screen.findByRole('alert')).toHaveTextContent('Ruxsat berilmagan.');
 });
});
