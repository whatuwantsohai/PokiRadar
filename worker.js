const API_BASE = "https://api.pokemontcgapi.com/v1";

const ALLOWED_ORIGINS = [
  "https://whatuwantsohai.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

function getCorsOrigin(request) {
  const origin = request.headers.get("Origin") || "";

  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  return "https://whatuwantsohai.github.io";
}

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(request),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request, data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders(request)
      }
    }
  );
}

export default {
  async fetch(request, env) {

    /*
     * CORS preflight
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request)
      });
    }

    /*
     * Only GET is allowed
     */
    if (request.method !== "GET") {
      return json(request, {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "PokiRadar API proxy only accepts GET requests."
        }
      }, 405);
    }

    const url = new URL(request.url);

    /*
     * Health check
     *
     * Open:
     * https://YOUR-WORKER.workers.dev/
     *
     * If this works, the Worker itself is alive.
     */
    if (url.pathname === "/") {
      return json(request, {
        ok: true,
        service: "PokiRadar API Proxy",
        status: "online"
      });
    }

    /*
     * API route
     */
    if (url.pathname !== "/api/cards") {
      return json(request, {
        error: {
          code: "NOT_FOUND",
          message: "PokiRadar API route not found.",
          path: url.pathname
        }
      }, 404);
    }

    /*
     * The live API key MUST exist as a Cloudflare Secret.
     */
    const apiKey = env.PTCG_API_KEY;

    if (!apiKey) {
      return json(request, {
        error: {
          code: "MISSING_SERVER_KEY",
          message: "PTCG_API_KEY is not configured in Cloudflare Worker."
        }
      }, 500);
    }

    try {

      let targetURL;

      /*
       * Cursor pagination
       *
       * PokiRadar sends:
       * ?next=https://api.pokemontcgapi.com/v1/cards?...
       */
      const next = url.searchParams.get("next");

      if (next) {

        let parsedNext;

        try {
          parsedNext = new URL(next);
        } catch {
          return json(request, {
            error: {
              code: "INVALID_NEXT",
              message: "The supplied pagination URL is invalid."
            }
          }, 400);
        }

        /*
         * Security:
         * only allow the official Pokémon TCG API.
         */
        if (
          parsedNext.origin !==
          "https://api.pokemontcgapi.com"
        ) {
          return json(request, {
            error: {
              code: "INVALID_NEXT_HOST",
              message: "Pagination destination is not allowed."
            }
          }, 400);
        }

        targetURL = parsedNext.toString();

      } else {

        const target = new URL(
          `${API_BASE}/cards`
        );

        /*
         * Only forward parameters PokiRadar actually uses.
         */
        const allowedParameters = [
          "q",
          "limit",
          "include",
          "select",
          "orderBy",
          "lang",
          "region"
        ];

        for (const parameter of allowedParameters) {

          const value =
            url.searchParams.get(parameter);

          if (value !== null) {
            target.searchParams.set(
              parameter,
              value
            );
          }
        }

        targetURL = target.toString();
      }

      /*
       * Call Pokémon TCG API.
       *
       * The live key NEVER goes to the browser.
       */
      const apiResponse = await fetch(
        targetURL,
        {
          method: "GET",
          headers: {
            "X-Api-Key": apiKey,
            "Accept": "application/json"
          }
        }
      );

      const body = await apiResponse.text();

      /*
       * Return the API response to PokiRadar.
       */
      return new Response(
        body,
        {
          status: apiResponse.status,
          headers: {
            "Content-Type":
              apiResponse.headers.get(
                "Content-Type"
              ) ||
              "application/json",

            ...corsHeaders(request)
          }
        }
      );

    } catch (error) {

      return json(request, {
        error: {
          code: "PROXY_ERROR",
          message:
            error?.message ||
            "Cloudflare Worker could not contact the Pokémon TCG API."
        }
      }, 500);
    }
  }
};
