import { Injectable, computed, inject, signal } from '@angular/core';
import type { CityRow } from '@norte/core';
import { DataService } from './data.service';
import { countryName } from './format';

export interface Place {
  country: string;
  city: string | null;
}

export type LocateState = 'idle' | 'locating' | 'done' | 'denied' | 'unavailable' | 'error';

/** Distancia aproximada en km (equirrectangular): basta para elegir la ciudad más cercana. */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/**
 * Ubicación de la persona sin que salga de su dispositivo: el navegador da las coordenadas (solo si ella lo permite)
 * y aquí se elige la ciudad más cercana con el archivo de ciudades del índice. Las coordenadas no se guardan ni se envían.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly data = inject(DataService);
  readonly state = signal<LocateState>('idle');

  /** Países ordenados: primero los que tienen vacantes presenciales, luego el resto por nombre. */
  readonly countries = computed(() => {
    const list = this.data.geo()?.countries ?? [];
    return [...list].map((c) => ({ ...c, name: countryName(c.iso) || c.name })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'es'));
  });

  /** País sugerido por el idioma del navegador («es-EC» → EC); no pide permiso. */
  guessCountry(): string | null {
    const known = new Set(this.countries().map((c) => c.iso));
    for (const tag of typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]) {
      const region = /-([A-Z]{2})$/i.exec(tag)?.[1]?.toUpperCase();
      if (region && known.has(region)) return region;
    }
    return null;
  }

  async locate(): Promise<Place | null> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      this.state.set('unavailable');
      return null;
    }
    this.state.set('locating');
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 3_600_000 }),
      );
      const place = this.nearest((await this.data.loadCities()).cities, pos.coords.latitude, pos.coords.longitude);
      this.state.set(place ? 'done' : 'error');
      return place;
    } catch (err) {
      this.state.set((err as GeolocationPositionError)?.code === 1 ? 'denied' : 'error');
      return null;
    }
  }

  nearest(cities: CityRow[], lat: number, lon: number): Place | null {
    let best: CityRow | null = null;
    let bestKm = Infinity;
    for (const c of cities) {
      const km = distanceKm(lat, lon, c[3], c[4]);
      if (km < bestKm) {
        bestKm = km;
        best = c;
      }
    }
    return best ? { country: best[2], city: best[0] } : null;
  }

  /** Ciudades para elegir: primero las que tienen vacantes, luego las más pobladas del país. */
  async citiesOf(country: string): Promise<string[]> {
    const withJobs = (this.data.geo()?.countries.find((c) => c.iso === country)?.cities ?? []).map((c) => c.name);
    const rows = await this.data.loadCities().then((f) => f.cities.filter((c) => c[2] === country).map((c) => c[0])).catch(() => [] as string[]);
    return [...new Set([...withJobs, ...rows])];
  }
}
