const API_BASE = "https://api.pokemontcgapi.com/v1";

const ALLOWED_ORIGINS = [
  "https://whatuwantsohai.github.io"
];

function corsHeaders(origin){

  const allowed =
    ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };

}

function json(data,status,origin){

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "Content-Type":
          "application/json; charset=utf-8",
        ...corsHeaders(origin)
      }
    }
  );

}

export default {

  async fetch(request,env){

    const origin =
      request.headers.get(
        "Origin"
      ) || "";

    if(
      request.method ===
      "OPTIONS"
    ){

      return new Response(
        null,
        {
          status:204,
          headers:corsHeaders(
            origin
          )
        }
      );

    }

    const url =
      new URL(request.url);

    if(
      url.pathname !==
      "/api/cards"
    ){

      return json(
        {
          error:{
            code:"NOT_FOUND",
            message:"PokiRadar API route not found."
          }
        },
        404,
        origin
      );

    }

    if(
      request.method !==
      "GET"
    ){

      return json(
        {
          error:{
            code:"METHOD_NOT_ALLOWED",
            message:"GET only."
          }
        },
        405,
        origin
      );

    }

    /*
      The live key exists ONLY in
      Cloudflare's encrypted secret store.

      Never put the actual key here.
    */

    const apiKey =
      env.PTCG_API_KEY;

    if(!apiKey){

      return json(
        {
          error:{
            code:"MISSING_SERVER_KEY",
            message:
              "PokiRadar server API key has not been configured."
          }
        },
        500,
        origin
      );

    }

    try{

      let targetUrl;

      /*
        Load More passes the API's
        cursor URL through ?next=...
      */

      const next =
        url.searchParams.get(
          "next"
        );

      if(next){

        const decoded =
          decodeURIComponent(
            next
          );

        const parsed =
          new URL(decoded);

        /*
          Security:
          only allow the official API
          as the destination.
        */

        if(
          parsed.origin !==
          "https://api.pokemontcgapi.com"
        ){

          return json(
            {
              error:{
                code:"INVALID_NEXT",
                message:
                  "Invalid API pagination destination."
              }
            },
            400,
            origin
          );

        }

        targetUrl =
          parsed.toString();

      }else{

        /*
          Normal card request.
          Only allow controlled query
          parameters through.
        */

        const target =
          new URL(
            `${API_BASE}/cards`
          );

        const allowedParams = [
          "q",
          "limit",
          "include",
          "select",
          "orderBy",
          "lang",
          "region"
        ];

        for(
          const key of allowedParams
        ){

          const value =
            url.searchParams.get(
              key
            );

          if(value !== null){

            target.searchParams.set(
              key,
              value
            );

          }

        }

        targetUrl =
          target.toString();

      }

      const response =
        await fetch(
          targetUrl,
          {
            method:"GET",
            headers:{
              "X-Api-Key":apiKey,
              "Accept":
                "application/json"
            }
          }
        );

      const body =
        await response.text();

      return new Response(
        body,
        {
          status:response.status,
          headers:{
            "Content-Type":
              response.headers.get(
                "Content-Type"
              ) ||
              "application/json",
            ...corsHeaders(
              origin
            )
          }
        }
      );

    }catch(error){

      return json(
        {
          error:{
            code:"PROXY_ERROR",
            message:
              error.message ||
              "Proxy request failed."
          }
        },
        500,
        origin
      );

    }

  }

};
