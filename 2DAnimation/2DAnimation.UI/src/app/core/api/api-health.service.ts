import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HealthDto } from '../models/health.model';

/** `/api` is forwarded to the local ASP.NET Core API by proxy.conf.json during `ng serve`. */
export const API_BASE_URL = '/api';

@Injectable({ providedIn: 'root' })
export class ApiHealthService {
  private readonly http = inject(HttpClient);

  getHealth(): Observable<HealthDto> {
    return this.http.get<HealthDto>(`${API_BASE_URL}/health`);
  }
}
