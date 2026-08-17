import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RouteWeather } from "./weather.server";

export type { RouteWeather, RouteWeatherPoint } from "./weather.server";

const schema = z.object({
  encodedPolyline: z.string().min(1).max(20000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.number().int().min(0).max(3000),
});

export const forecastRouteWeather = createServerFn({ method: "POST" })
  .inputValidator((input: { encodedPolyline: string; date: string; time: string; minutes: number }) =>
    schema.parse(input),
  )
  .handler(async ({ data }): Promise<RouteWeather> => {
    const { fetchRouteWeather } = await import("./weather.server");
    return fetchRouteWeather(data);
  });
