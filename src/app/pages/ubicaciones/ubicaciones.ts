import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { Pais } from '../../services/pais';
import { Departamento } from '../../services/departamento';
import { Ciudad } from '../../services/ciudad';

@Component({
  selector: 'app-ubicaciones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ubicaciones.html',
  styleUrls: ['./ubicaciones.css'],
})
export class Ubicaciones implements OnInit {

  paises: any[] = [];
  departamentos: any[] = [];
  ciudades: any[] = [];
  tabla: any[] = [];

  // loading flags
  loadingPais = false;
  loadingDepartamento = false;
  loadingCiudad = false;

  form: FormGroup;

  successMessage: string | null = null;
  errorMessage: string | null = null;

  // edit modal state
  editModalOpen = false;
  editIds: { paisId: number | null, departamentoId: number | null, ciudadId: number | null } = { paisId: null, departamentoId: null, ciudadId: null };
  editForm: FormGroup; // do not initialize here (fb not ready)

  constructor(
    private fb: FormBuilder,
    private paisService: Pais,
    private departamentoService: Departamento,
    private ciudadService: Ciudad
  ) {
    this.form = this.fb.group({
      paisId: [null],
      departamentoId: [{ value: null, disabled: true }], // <--- start disabled
      nombreDepartamento: [''],
      nombreCiudad: [''],
      nombrePais: [''] // added control for crear país
    });
    // initialize editForm here after fb is available
    this.editForm = this.fb.group({
      paisNombre: [''],
      departamentoNombre: [''],
      ciudadNombre: ['']
    });
  }

  ngOnInit() {
    this.refreshAll();
  }

  // new: refresh todas las listas y construir la tabla combinada
  refreshAll() {
    forkJoin({
      paises: this.paisService.getAll(),
      departamentos: this.departamentoService.getAll(),
      ciudades: this.ciudadService.getAll()
    }).subscribe({
      next: ({ paises, departamentos, ciudades }) => {
        this.paises = paises;
        this.departamentos = departamentos;
        this.ciudades = ciudades;
        // cargar banderas para los paises (no bloqueante)
        this.loadFlagsForPaises();
        this.buildTabla();
      },
      error: (err) => {
        console.error('Error cargando datos:', err);
      }
    });
  }

  // nueva función: intenta obtener la URL de la bandera desde restcountries.com por nombre
  private async loadFlagsForPaises() {
    if (!Array.isArray(this.paises)) return;
    // usar Promise.all para paralelizar
    await Promise.all((this.paises || []).map(async (p: any) => {
      try {
        const name = encodeURIComponent((p.nombre ?? p.Nombre ?? '').trim());
        if (!name) return;
        // solicitar solo campos necesarios para ahorrar payload
        const url = `https://restcountries.com/v3.1/name/${name}?fields=flags,name`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data) && data[0]?.flags) {
          // preferir png, fallback a svg
          p.flagUrl = data[0].flags.png ?? data[0].flags.svg ?? '';
        }
      } catch (e) {
        console.warn('flag fetch failed for', p, e);
      }
    }));
    // reconstruir tabla ahora que tenemos flags
    this.buildTabla();
  }

  // build tabla combinada (pais - departamento - ciudad)
  buildTabla() {
    this.tabla = (this.ciudades || []).map(c => {
      const dep = (this.departamentos || []).find(d => d.id === (c.departamentoId ?? c.DepartamentoId));
      const pais = dep ? (this.paises || []).find(p => p.id === (dep.paisId ?? dep.PaisId)) : null;
      return {
        paisId: pais?.id ?? null,
        paisNombre: pais?.nombre ?? pais?.Nombre ?? '',
        paisFlag: pais?.flagUrl ?? '', // <-- nueva propiedad con URL de la bandera
        departamentoId: dep?.id ?? null,
        departamentoNombre: dep?.nombre ?? dep?.Nombre ?? '',
        ciudadId: c.id ?? null,
        ciudadNombre: c.nombre ?? c.Nombre ?? ''
      };
    });
  }

  onPaisChange() {
    const paisId = this.form.get('paisId')?.value;
    const depControl = this.form.get('departamentoId');

    if (!paisId) {
      this.departamentos = [];
      this.ciudades = [];
      depControl?.reset(null, { emitEvent: false });
      depControl?.disable({ emitEvent: false }); // <--- disable when no pais
      return;
    }

    const id = Number(paisId);
    depControl?.enable({ emitEvent: false }); // <--- enable when pais selected
    depControl?.reset(null, { emitEvent: false });

    this.departamentoService.getByPais(id)
      .subscribe(d => {
        this.departamentos = d;
        console.log('departamentos for pais', id, d);
        // keep departamento control reset so user must choose one
      });

    this.ciudades = [];
  }

  onDepartamentoChange() {
    const depId = this.form.get('departamentoId')?.value;
    if (!depId) {
      this.ciudades = [];
      return;
    }

    const id = Number(depId);
    this.ciudadService.getByDepartamento(id)
      .subscribe(c => {
        this.ciudades = c;
        console.log('ciudades for departamento', id, c);
      });
  }

  crearPais() {
    const nombre = this.form.get('nombrePais')?.value?.trim();
    if (!nombre) return;
    const data = { nombre: nombre };

    this.loadingPais = true;
    this.paisService.create(data).pipe(
      finalize(() => this.loadingPais = false)
    ).subscribe({
      next: (res) => {
        console.log('crearPais response:', res);
        this.successMessage = 'País guardado correctamente';
        this.errorMessage = null;
        // actualizar select de paises inmediatamente
        this.paisService.getAll().subscribe(p => {
          this.paises = p;
          console.log('paises:', p);
          // opcional: reconstruir tabla si hay cambios relevants
          this.buildTabla();
        });
        this.form.patchValue({ nombrePais: '' });
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        console.error('crearPais error:', err);
        this.errorMessage = 'Error al guardar país';
        setTimeout(() => this.errorMessage = null, 4000);
      }
    });
  }

  crearDepartamento() {
    const paisId = this.form.get('paisId')?.value;
    const nombre = this.form.get('nombreDepartamento')?.value?.trim();

    if (!paisId || !nombre) return;

    const data = {
      nombre: nombre,
      paisId: Number(paisId)
    };

    this.loadingDepartamento = true;
    this.departamentoService.create(data).pipe(
      finalize(() => this.loadingDepartamento = false)
    ).subscribe({
      next: (res) => {
        console.log('crearDepartamento response:', res);
        this.successMessage = 'Departamento guardado correctamente';
        this.errorMessage = null;
        // actualizar select de departamentos para el país seleccionado
        this.departamentoService.getByPais(Number(paisId)).subscribe(d => {
          this.departamentos = d;
          console.log('departamentos refreshed for pais', paisId, d);
          // enable department control if needed
          const depControl = this.form.get('departamentoId');
          depControl?.enable({ emitEvent: false });
        });
        this.form.patchValue({ nombreDepartamento: '' });
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        console.error('crearDepartamento error:', err);
        this.errorMessage = 'Error al guardar departamento';
        setTimeout(() => this.errorMessage = null, 4000);
      }
    });
  }

  crearCiudad() {
    const departamentoId = this.form.get('departamentoId')?.value;
    const nombre = this.form.get('nombreCiudad')?.value?.trim();

    if (!departamentoId || !nombre) return;

    const data = {
      nombre: nombre,
      departamentoId: Number(departamentoId)
    };

    this.loadingCiudad = true;
    this.ciudadService.create(data).pipe(
      finalize(() => this.loadingCiudad = false)
    ).subscribe({
      next: (res) => {
        console.log('crearCiudad response:', res);
        this.successMessage = 'Ciudad guardada correctamente';
        this.errorMessage = null;
        // actualizar lista de ciudades para el departamento seleccionado
        this.ciudadService.getByDepartamento(Number(departamentoId)).subscribe(c => {
          this.ciudades = c;
          console.log('ciudades refreshed for departamento', departamentoId, c);
          this.buildTabla();
        });
        this.form.patchValue({ nombreCiudad: '' });
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: (err) => {
        console.error('crearCiudad error:', err);
        this.errorMessage = 'Error al guardar ciudad';
        setTimeout(() => this.errorMessage = null, 4000);
      }
    });
  }

  // agrega: eliminar fila (ciudad -> departamento -> pais) en secuencia y refrescar
  deleteRow(r: any) {
    const ciudadId = r.ciudadId;
    const departamentoId = r.departamentoId;
    const paisId = r.paisId;

    if (!confirm('Confirma eliminar ciudad, departamento y país asociados?')) return;

    // eliminar en secuencia: ciudad -> departamento -> pais
    if (ciudadId) {
      this.ciudadService.delete(ciudadId).subscribe({
        next: () => {
          console.log('ciudad deleted', ciudadId);
          if (departamentoId) {
            this.departamentoService.delete(departamentoId).subscribe({
              next: () => {
                console.log('departamento deleted', departamentoId);
                if (paisId) {
                  this.paisService.delete(paisId).subscribe({
                    next: () => {
                      console.log('pais deleted', paisId);
                      this.successMessage = 'Registros eliminados correctamente';
                      this.errorMessage = null;
                      this.refreshAll();
                      setTimeout(() => this.successMessage = null, 3000);
                    },
                    error: err => {
                      console.error('error deleting pais', err);
                      this.errorMessage = 'Error al eliminar país';
                    }
                  });
                } else {
                  this.refreshAll();
                }
              },
              error: err => {
                console.error('error deleting departamento', err);
                this.errorMessage = 'Error al eliminar departamento';
              }
            });
          } else {
            this.refreshAll();
          }
        },
        error: err => {
          console.error('error deleting ciudad', err);
          this.errorMessage = 'Error al eliminar ciudad';
        }
      });
    } else {
      // si no hay ciudad, intenta borrar dept/pais
      if (departamentoId) {
        this.departamentoService.delete(departamentoId).subscribe({
          next: () => {
            if (paisId) {
              this.paisService.delete(paisId).subscribe({
                next: () => {
                  this.refreshAll();
                },
                error: err => { console.error(err); this.errorMessage = 'Error al eliminar país'; }
              });
            } else this.refreshAll();
          },
          error: err => { console.error(err); this.errorMessage = 'Error al eliminar departamento'; }
        });
      }
    }
  }

  // expuesta para que la ventana popup invoque la actualización
  private handleUpdate(payload: { paisId:number|null, paisNombre:string, departamentoId:number|null, departamentoNombre:string, ciudadId:number|null, ciudadNombre:string }) {
    const ops: any[] = [];

    // buscar entidades actuales por id en las listas cargadas
    const currentPais = payload.paisId != null ? (this.paises || []).find(p => p.id === payload.paisId) : null;
    const currentDep = payload.departamentoId != null ? (this.departamentos || []).find(d => d.id === payload.departamentoId) : null;
    const currentCiu = payload.ciudadId != null ? (this.ciudades || []).find(c => c.id === payload.ciudadId) : null;

    // helper para normalizar nombre
    const norm = (v: any) => (v ?? '').toString().trim();

    // solo agregar update si el nombre cambió respecto al valor actual
    if (payload.paisId != null) {
      const currentName = currentPais ? (norm(currentPais.nombre) || norm(currentPais.Nombre)) : '';
      if (norm(payload.paisNombre) && norm(payload.paisNombre) !== currentName) {
        // enviar id y nombre en el body
        ops.push(this.paisService.update(payload.paisId, { id: payload.paisId, nombre: payload.paisNombre }));
      }
    }

    if (payload.departamentoId != null) {
      const currentName = currentDep ? (norm(currentDep.nombre) || norm(currentDep.Nombre)) : '';
      if (norm(payload.departamentoNombre) && norm(payload.departamentoNombre) !== currentName) {
        // enviar id, nombre y paisId (si disponible) en el body
        const paisIdForDto = payload.paisId ?? (currentDep ? (currentDep.paisId ?? currentDep.PaisId) : null);
        ops.push(this.departamentoService.update(payload.departamentoId, { id: payload.departamentoId, nombre: payload.departamentoNombre, paisId: paisIdForDto }));
      }
    }

    if (payload.ciudadId != null) {
      const currentName = currentCiu ? (norm(currentCiu.nombre) || norm(currentCiu.Nombre)) : '';
      if (norm(payload.ciudadNombre) && norm(payload.ciudadNombre) !== currentName) {
        // enviar id, nombre y departamentoId (si disponible) en el body
        const depIdForDto = payload.departamentoId ?? (currentCiu ? (currentCiu.departamentoId ?? currentCiu.DepartamentoId) : null);
        ops.push(this.ciudadService.update(payload.ciudadId, { id: payload.ciudadId, nombre: payload.ciudadNombre, departamentoId: depIdForDto }));
      }
    }

    if (ops.length === 0) {
      this.successMessage = 'No hubo cambios para actualizar';
      setTimeout(() => this.successMessage = null, 2000);
      return;
    }

    forkJoin(ops).subscribe({
      next: res => {
        console.log('update results:', res);
        this.successMessage = 'Registros actualizados correctamente';
        this.errorMessage = null;
        this.refreshAll();
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: err => {
        console.error('error updating entities', err);
        this.errorMessage = 'Error al actualizar registros';
        setTimeout(() => this.errorMessage = null, 4000);
      }
    });
  }

  // abrir ventana popup con formulario simple para editar solo los nombres
  openEditWindow(r: any) {
    // poblar ids y formulario, abrir modal
    this.editIds = {
      paisId: r.paisId ?? null,
      departamentoId: r.departamentoId ?? null,
      ciudadId: r.ciudadId ?? null
    };
    this.editForm.patchValue({
      paisNombre: r.paisNombre ?? '',
      departamentoNombre: r.departamentoNombre ?? '',
      ciudadNombre: r.ciudadNombre ?? ''
    });
    this.editModalOpen = true;
  }

  closeEditModal() {
    this.editModalOpen = false;
    this.editForm.reset();
    this.editIds = { paisId: null, departamentoId: null, ciudadId: null };
  }

  saveEdit() {
    const payload = {
      paisId: this.editIds.paisId,
      paisNombre: this.editForm.get('paisNombre')?.value?.trim() ?? '',
      departamentoId: this.editIds.departamentoId,
      departamentoNombre: this.editForm.get('departamentoNombre')?.value?.trim() ?? '',
      ciudadId: this.editIds.ciudadId,
      ciudadNombre: this.editForm.get('ciudadNombre')?.value?.trim() ?? ''
    };
    // reutiliza la lógica existente para actualizar solo los que cambiaron
    this.handleUpdate(payload);
    this.closeEditModal();
  }
}