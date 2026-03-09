import { config } from "../../config.js";

export type TodayWeatherForecast = {
  date: string;
  weatherCode: number;
  tempMinC: number;
  tempMaxC: number;
  precipitationProbabilityMax: number;
  windSpeedMaxKmh: number;
};

export interface WeatherService {
  getTodayForecast(): Promise<TodayWeatherForecast | null>;
}

export class NoopWeatherService implements WeatherService {
  async getTodayForecast(): Promise<TodayWeatherForecast | null> {
    return null;
  }
}

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
};

export class OpenMeteoWeatherService implements WeatherService {
  async getTodayForecast(): Promise<TodayWeatherForecast | null> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", "12.2388");
    url.searchParams.set("longitude", "109.1967");
    url.searchParams.set("timezone", config.defaultTimezone);
    url.searchParams.set("forecast_days", "1");
    url.searchParams.set(
      "daily",
      "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max"
    );

    const res = await fetch(url.toString());
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json()) as OpenMeteoDailyResponse;
    const daily = payload.daily;
    const date = daily?.time?.[0];
    const weatherCode = daily?.weather_code?.[0];
    const tempMinC = daily?.temperature_2m_min?.[0];
    const tempMaxC = daily?.temperature_2m_max?.[0];
    const precipitationProbabilityMax = daily?.precipitation_probability_max?.[0];
    const windSpeedMaxKmh = daily?.wind_speed_10m_max?.[0];

    if (
      typeof date !== "string" ||
      typeof weatherCode !== "number" ||
      typeof tempMinC !== "number" ||
      typeof tempMaxC !== "number" ||
      typeof precipitationProbabilityMax !== "number" ||
      typeof windSpeedMaxKmh !== "number"
    ) {
      return null;
    }

    return {
      date,
      weatherCode,
      tempMinC,
      tempMaxC,
      precipitationProbabilityMax,
      windSpeedMaxKmh
    };
  }
}

