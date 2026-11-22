/** Cloudflare Worker: Deploy once, then add Custom Domains:
 * free.goldpick.6uv0.xyz
 * vip.goldpick.6uv0.xyz
 * Requires existing GitHub Pages origin https://goldpick.6uv0.xyz/
 * No secrets or VIP article body are stored in this Worker. Supabase RLS protects VIP data.
 */
export default {
 async fetch(request){
  const host=new URL(request.url).hostname.toLowerCase();
  const mode=host==="free.goldpick.6uv0.xyz"?"free":host==="vip.goldpick.6uv0.xyz"?"vip":null;
  if(!mode)return new Response("Not found",{status:404});
  const u=new URL(request.url);
  if(u.pathname!=="/"&&u.pathname!=="/index.html")return Response.redirect("https://goldpick.6uv0.xyz/"+mode+"/",302);
  const response=await fetch("https://goldpick.6uv0.xyz/"+mode+"/index.html",{headers:{"Accept":"text/html"}});
  if(!response.ok)return new Response("Portal origin unavailable",{status:502});
  const headers=new Headers(response.headers);headers.set("Cache-Control","no-cache, must-revalidate");headers.set("X-Content-Type-Options","nosniff");
  headers.set("Content-Security-Policy","frame-ancestors 'none'");headers.delete("content-security-policy-report-only");
  return new Response(response.body,{status:200,headers});
 }
};
