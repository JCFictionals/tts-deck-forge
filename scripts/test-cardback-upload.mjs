import worker from "../dist/server/index.js";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
for (const id of ["backFile", "catboxUserhash", "imgurClientId", "uploadBackBtn", "uploadedBackUrl"]) {
  if (!html.includes(`id="${id}"`) || !app.includes(`#${id}`)) throw new Error(`Upload control ${id} is not wired to the app.`);
}
if (!app.includes("state.uploadedBackUrl") || !app.includes("await loadImage(result.url)")) throw new Error("Uploaded card back must be used by export and checked in the browser.");

const png = new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])], "cardback.png", { type: "image/png" });
const makeRequest = ({ file = png, userhash = "", clientId = "", prefer = "catbox" } = {}) => {
  const form = new FormData();form.append("file",file);form.append("prefer",prefer);
  if (userhash) form.append("userhash",userhash);
  if (clientId) form.append("imgurClientId",clientId);
  return new Request("https://local/api/upload-cardback",{method:"POST",body:form});
};

const realFetch=globalThis.fetch;
try {
  const calls=[];
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    if (String(url).includes("catbox")) return new Response("https://files.catbox.moe/mycard.png");
    throw new Error("Imgur should not be called after Catbox succeeds.");
  };
  const catbox=await worker.fetch(makeRequest({userhash:"my-userhash",clientId:"imgur-id"}));
  const result=await catbox.json();
  if (catbox.status!==200||result.provider!=="catbox"||result.url!=="https://files.catbox.moe/mycard.png"||calls.length!==1) throw new Error("Catbox upload did not return its hosted URL.");
  if ((await calls[0].options.body.get("userhash"))!=="my-userhash" || calls[0].options.body.get("reqtype")!=="fileupload") throw new Error("Catbox userhash or upload format was lost.");

  calls.length=0;
  const anonymous=await worker.fetch(makeRequest());
  if ((await anonymous.json()).provider!=="catbox"||calls[0].options.body.has("userhash")) throw new Error("Catbox upload should work without an account or userhash.");

  calls.length=0;
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    if (String(url).includes("catbox")) return new Response("Catbox unavailable",{status:503});
    return new Response(JSON.stringify({success:true,data:{link:"https://i.imgur.com/backup.png"}}),{headers:{"content-type":"application/json"}});
  };
  const backup=await worker.fetch(makeRequest({userhash:"my-userhash",clientId:"imgur-id"}));
  const backupBody=await backup.json();
  if (backup.status!==200||backupBody.provider!=="imgur"||!backupBody.fallbackUsed||calls.length!==2||calls[1].options.headers.Authorization!=="Client-ID imgur-id") throw new Error("Imgur fallback was not used after Catbox failed.");
  if (calls[1].options.body.has("userhash")) throw new Error("Catbox userhash leaked to Imgur.");

  calls.length=0;
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    return String(url).includes("catbox") ? new Response("https://evil.example/cardback.png") : new Response(JSON.stringify({success:true,data:{link:"https://i.imgur.com/safe.png"}}));
  };
  const invalidHost=await worker.fetch(makeRequest({clientId:"imgur-id"}));
  if ((await invalidHost.json()).url!=="https://i.imgur.com/safe.png"||calls.length!==2) throw new Error("An invalid Catbox host was accepted as a card back.");

  calls.length=0;
  globalThis.fetch=async (url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,data:{link:"https://i.imgur.com/backup.png"}}));};
  const direct=await worker.fetch(makeRequest({clientId:"imgur-id",prefer:"imgur"}));
  if ((await direct.json()).provider!=="imgur"||calls.length!==1||!String(calls[0].url).includes("imgur")) throw new Error("Explicit Imgur retry still contacted Catbox.");

  globalThis.fetch=async()=>new Response("Catbox unavailable",{status:503});
  const noBackup=await worker.fetch(makeRequest());
  if (noBackup.status!==502||!(await noBackup.json()).error.includes("Imgur Client ID")) throw new Error("Missing Imgur backup did not produce useful guidance.");

  const badFile=new File(["not an image"],"fake.png",{type:"image/png"});
  const rejected=await worker.fetch(makeRequest({file:badFile}));
  if (rejected.status!==400) throw new Error("The upload accepted a file with a forged image type.");
} finally { globalThis.fetch=realFetch; }
console.log("Card back upload and fallback tests passed.");
