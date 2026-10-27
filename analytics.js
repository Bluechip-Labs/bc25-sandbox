// BC25 Sandbox — analytics loader. Umami (cookieless; no cookie-consent banner needed).
// Captures: unique daily/weekly visitors, new vs returning (repeat) users, and
// average visit time — automatically from page views, across index.html + arcade.html.
//
// SETUP (one time):
//   1. Create a free account at https://cloud.umami.is  (or self-host Umami).
//   2. Add a website for this site's URL; copy its "Website ID" (a UUID).
//   3. Paste that UUID into UMAMI_WEBSITE_ID below and redeploy.
// Until a valid ID is set, this file makes NO network calls (it simply no-ops),
// so it is safe to ship as-is.
(function () {
  var UMAMI_WEBSITE_ID = "a8aa6a4f-ce2e-4d9d-a8d5-d60b156cc6c3";
  // If you self-host Umami, change this to your instance's script URL.
  var UMAMI_SRC = "https://cloud.umami.is/script.js";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(UMAMI_WEBSITE_ID)) return;
  try {
    var s = document.createElement("script");
    s.defer = true;
    s.src = UMAMI_SRC;
    s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
    document.head.appendChild(s);
  } catch (e) {}
})();
