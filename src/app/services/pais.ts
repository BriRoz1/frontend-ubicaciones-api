import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class Pais {
   private api = 'https://localhost:7235/api/paises';

  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<any[]>(this.api);
  }

  create(pais: any) {
    return this.http.post(this.api, pais);
  }

  update(id: number, dto: any) {
    return this.http.put<void>(`${this.api}/${id}`, dto);
  }

  delete(id: number) {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
