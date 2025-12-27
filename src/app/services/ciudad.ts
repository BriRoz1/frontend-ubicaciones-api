import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Ciudad {
    private api = 'https://localhost:7235/api/ciudades';

  constructor(private http: HttpClient) {}

  getByDepartamento(departamentoId: number) {
    return this.http.get<any[]>(`${this.api}/por-departamento/${departamentoId}`);
  }

  getAll() {
    return this.http.get<any[]>(this.api);
  }

  create(ciudad: any) {
    return this.http.post(this.api, ciudad);
  }

  update(id: number, dto: any) {
    return this.http.put<void>(`${this.api}/${id}`, dto);
  }

  delete(id: number) {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
