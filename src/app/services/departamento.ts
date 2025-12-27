import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Departamento {
   private api = 'https://localhost:7235/api/departamentos';

  constructor(private http: HttpClient) {}

  getByPais(paisId: number) {
    return this.http.get<any[]>(`${this.api}/por-pais/${paisId}`);
  }

  getAll() {
    return this.http.get<any[]>(this.api);
  }

  create(departamento: any) {
    return this.http.post(this.api, departamento);
  }

  update(id: number, dto: any) {
    return this.http.put<void>(`${this.api}/${id}`, dto);
  }

  delete(id: number) {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
