<h1>Hey everyone, this us our GitHub repository</h1>
<p> 
    Here, you can fork from this original repository and submit changes to help us as part of our community.
    This is mostly however a page for people trying to help as part of our team.
    Right below is the link to our website. It would be nice for you to visit and see how far we have come.
    Additionally, searching up 'Xonra' on Google.com can help you find our website. 
</p>
<a href = https://xonra.vercel.app/ _blank>xonra.com</a>
<p>
     
</p>
<p> 
    If you want to suggest things we could add to out website or get quick updates on how everything is going,
    you can check our discord, also linked below.
</p>
<a href = https://discord.gg/BR9hQTmSU5/ _blank>discord.gg/sH7WCHdYFp</a>

<h2>Push notifications setup</h2>
<p>
    The site now includes a real server-side web push system for Vercel deployments.
    To make notifications reach all subscribed devices, set these environment variables in Vercel:
</p>
<ul>
    <li><code>KV_REST_API_URL</code></li>
    <li><code>KV_REST_API_TOKEN</code></li>
    <li><code>WEB_PUSH_PUBLIC_KEY</code></li>
    <li><code>WEB_PUSH_PRIVATE_KEY</code></li>
    <li><code>WEB_PUSH_SUBJECT</code></li>
    <li><code>XONRA_ADMIN_CODE_HASH</code></li>
</ul>
<p>
    You can generate the push keys and the admin passcode hash with:
</p>
<pre><code>node generate-secrets.mjs "your-admin-passcode"</code></pre>
<p>
    After those values are added in Vercel, publish notifications from <code>admin.html</code> and they will fan out to every browser/device that subscribed through the site.
</p>
