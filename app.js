"use strict";
const STORE="ot-loaner-pwa-v2";
const FLOW_URL = 
"https://defaultf0b669c421984f6890031f463c4b42.c0.environment.api.powerplatform.com/powerautomate/automations/direct/cu/06/workflows/f4874055b69b45e8be5ae6b4add7d44f/triggers/manual/paths/invoke?api-version=1";
const $=id=>document.getElementById(id);let selectedStatus="Pending to Check",currentLoan="OT_Loaner01",scanner=null,scannerRunning=false;
function normalizeLoan(v){const m=String(v||"").trim().match(/^OT_Loaner(\d{1,3})$/i);if(!m)return null;const n=Number(m[1]);return n>=1&&n<=100?`OT_Loaner${String(n).padStart(2,"0")}`:null}
function extractLoan(v){const direct=normalizeLoan(v);if(direct)return direct;try{const u=new URL(String(v));return normalizeLoan(u.searchParams.get("loan")||u.hash.replace(/^#/,""))}catch{return null}}
function rows(){try{return JSON.parse(localStorage.getItem(STORE)||"[]")}catch{return []}}
function saveRows(v){localStorage.setItem(STORE,JSON.stringify(v))}
function setStatus(s){selectedStatus=s;document.querySelectorAll(".status-btn").forEach(b=>b.classList.toggle("active",b.dataset.status===s))}
function updateStats(){const d=rows();$("pendingCount").textContent=d.filter(x=>x.status==="Pending to Check").length;$("checkedCount").textContent=d.filter(x=>x.status==="Checked").length;$("returnedCount").textContent=d.filter(x=>x.status==="Returned").length}
function clearForm(){$("supplier").value="";$("model").value="";$("serial").value="";$("testDate").value=new Date().toISOString().slice(0,10);$("frequency").value="";setStatus("Pending to Check");$("toast").style.display="none"}
function loadLoan(value){const id=normalizeLoan(value);if(!id)return false;currentLoan=id;$("loanDisplay").textContent="# "+id;clearForm();const x=rows().find(v=>v.loanNumber===id);if(x){$("supplier").value=x.supplier||"";$("model").value=x.model||"";$("serial").value=x.serialNumber||"";$("testDate").value=x.testDate||$("testDate").value;$("frequency").value=x.testFrequency||"";setStatus(x.status||"Pending to Check")}history.replaceState(null,"",location.pathname+"?loan="+encodeURIComponent(id));return true}
const params=new URLSearchParams(location.search),hash=location.hash.replace(/^#/,"");loadLoan(extractLoan(params.get("loan")||hash)||"OT_Loaner01");
document.querySelectorAll(".status-btn").forEach(b=>b.addEventListener("click",()=>setStatus(b.dataset.status)));
$("form").addEventListener("submit",e=>{e.preventDefault();let valid=true;["supplier","model","serial","testDate","frequency"].forEach(id=>{const el=$(id),bad=!el.value.trim();el.classList.toggle("error",bad);if(bad)valid=false});if(!valid)return;const rec={loanNumber:currentLoan,supplier:$("supplier").value.trim(),model:$("model").value.trim(),serialNumber:$("serial").value.trim(),testDate:$("testDate").value,testFrequency:$("frequency").value.trim(),status:selectedStatus,updatedAt:new Date().toISOString()};const d=rows(),i=d.findIndex(x=>x.loanNumber===currentLoan);i>=0?d[i]=rec:d.push(rec);saveRows(d);
 fetch(FLOW_URL,{
    method:"POST",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify(rec)
})
.then(res=>{

    if(!res.ok){
        throw new Error(
            "Flow failed"
        );
    }

    console.log(
        "Power Automate updated"
    );

})
.catch(err=>{

    console.error(
        "Flow error",
        err
    );

});                                       
$("toast").textContent="Record saved for "+currentLoan+".";$("toast").style.display="block";updateStats()});
function showScanError(text){$("scannerError").textContent=text;$("scannerError").style.display="block"}
async function stopScanner(){if(scanner&&scannerRunning){try{await scanner.stop()}catch{}scannerRunning=false}if(scanner){try{scanner.clear()}catch{}scanner=null}}
async function closeScanner(){await stopScanner();$("scannerModal").classList.remove("open")}
async function startScanner(){$("scannerError").style.display="none";$("scannerModal").classList.add("open");if(!window.Html5Qrcode){showScanError("Scanner library did not load. Connect to the internet and reload once.");return}try{scanner=new Html5Qrcode("reader");scannerRunning=true;await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:230,height:230},aspectRatio:1},async decoded=>{const id=extractLoan(decoded);if(!id){showScanError("Invalid QR. Use OT_Loaner01 to OT_Loaner100.");return}await closeScanner();loadLoan(id);$("toast").textContent=id+" loaded from QR code.";$("toast").style.display="block"},()=>{})}catch{scannerRunning=false;showScanError("Camera could not start. Allow camera access and open the HTTPS GitHub Pages site.")}}
$("scanBtn").addEventListener("click",startScanner);$("closeScanner").addEventListener("click",closeScanner);$("scannerModal").addEventListener("click",e=>{if(e.target===$("scannerModal"))closeScanner()});$("manualLoad").addEventListener("click",async()=>{const id=extractLoan($("manualLoan").value);if(!id){showScanError("Enter OT_Loaner01 to OT_Loaner100.");return}await closeScanner();loadLoan(id)});
function dl(name,text,type){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
$("exportBtn").onclick=()=>{const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"',head=["Loan Number","Supplier","Model","Serial Number","Test Date","Test Frequency","Status","Updated At"],body=rows().map(x=>[x.loanNumber,x.supplier,x.model,x.serialNumber,x.testDate,x.testFrequency,x.status,x.updatedAt]);dl("OT_Loaner_Register.csv","\ufeff"+[head,...body].map(r=>r.map(esc).join(",")).join("\r\n"),"text/csv;charset=utf-8")};$("backupBtn").onclick=()=>dl("OT_Loaner_Backup.json",JSON.stringify(rows(),null,2),"application/json");
function net(){const online=navigator.onLine;$("networkState").textContent=online?"Online":"Offline";$("networkState").classList.toggle("offline",!online)}addEventListener("online",net);addEventListener("offline",net);net();
let installPrompt=null;addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;$("installBtn").style.display="block"});$("installBtn").onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("installBtn").style.display="none"};if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));updateStats();
