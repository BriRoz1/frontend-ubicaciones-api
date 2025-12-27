import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { Pais } from '../../services/pais';
import { Departamento } from '../../services/departamento';
import { Ciudad } from '../../services/ciudad';

/**
 * Página de Ubicaciones
 * ---------------------
 * Este componente gestiona la lista de países, departamentos y ciudades.
 * - Permite crear países, departamentos y ciudades.
 * - Carga banderas (flagUrl) consultando la API pública "REST Countries" por nombre de país.
 * - Muestra una tabla combinada (país - departamento - ciudad) con acciones de editar/eliminar.
 *
 * - Las funciones de refresco actualizan los arrays locales (paises, departamentos, ciudades)
 *   y reconstruyen la tabla combinada.
 * - Las operaciones CRUD usan los servicios inyectados: paisService, departamentoService, ciudadService.
 */

/** Componente principal */
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

  loadingPais = false;
  loadingDepartamento = false;
  loadingCiudad = false;

  form: FormGroup;

  successMessage: string | null = null;
  errorMessage: string | null = null;


  editModalOpen = false;
  editIds: { paisId: number | null, departamentoId: number | null, ciudadId: number | null } = { paisId: null, departamentoId: null, ciudadId: null };
  editForm: FormGroup; 
  constructor(
    private fb: FormBuilder,
    private paisService: Pais,
    private departamentoService: Departamento,
    private ciudadService: Ciudad
  ) {
    this.form = this.fb.group({
      paisId: [null],
      departamentoId: [{ value: null, disabled: true }], 
      nombreDepartamento: [''],
      nombreCiudad: [''],
      nombrePais: [''] 
    });

    this.editForm = this.fb.group({
      paisNombre: [''],
      departamentoNombre: [''],
      ciudadNombre: ['']
    });
  }

  ngOnInit() {
    this.refreshAll();
  }

  /**
   * Refresca todas las listas (países, departamentos, ciudades) y reconstruye la tabla.
   * Llamar al iniciar el componente o después de operaciones que modifiquen datos.
   */

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
        // cargar banderas para los paises 
        this.loadFlagsForPaises();
        this.buildTabla();
      },
      error: (err) => {
        console.error('Error cargando datos:', err);
      }
    });
  }

  /**
   * Intenta obtener la URL de la bandera desde restcountries.com para cada país cargado.
   * - Paraleliza las peticiones con Promise.all
   * - Asigna `flagUrl` dentro de cada objeto país si la API devuelve la información.
   * - No bloquea el renderizado inicial; al completar, reconstruye la tabla.
   */
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
    // reconstruir tabla 
    this.buildTabla();
  }

  /**
   * Construye la estructura usada por la vista de tabla combinada.
   * Cada fila incluye: paisId, paisNombre, paisFlag, departamentoId, departamentoNombre, ciudadId, ciudadNombre.
   */
  // build tabla combinada (pais - departamento - ciudad)
  buildTabla() {
    this.tabla = (this.ciudades || []).map(c => {
      const dep = (this.departamentos || []).find(d => d.id === (c.departamentoId ?? c.DepartamentoId));
      const pais = dep ? (this.paises || []).find(p => p.id === (dep.paisId ?? dep.PaisId)) : null;
      return {
        paisId: pais?.id ?? null,
        paisNombre: pais?.nombre ?? pais?.Nombre ?? '',
        paisFlag: pais?.flagUrl ?? '', 
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
      depControl?.disable({ emitEvent: false }); 
      return;
    }

    const id = Number(paisId);
    depControl?.enable({ emitEvent: false }); 
    depControl?.reset(null, { emitEvent: false });

    this.departamentoService.getByPais(id)
      .subscribe(d => {
        this.departamentos = d;
        console.log('departamentos for pais', id, d);

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

  /**
   * Crear un país nuevo usando el control nombrePais del formulario.
   * Muestra mensajes de éxito/error y refresca la lista local al completar.
   */
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
          //  reconstruir tabla si hay cambios relevants
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

  /**
   * Crear departamento asociado al país seleccionado.
   * Habilita/actualiza controles y listas según corresponda.
   */
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

  /**
   * Crear ciudad asociada al departamento seleccionado.
   * Refresca la lista de ciudades y la tabla combinada.
   */
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

  /**
   * Elimina fila (secuencial: ciudad -> departamento -> país) con confirmación.
   * Actualiza mensajes y refresca las listas al finalizar.
   */
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

  /**
   * Maneja la actualización de nombres (país, departamento, ciudad).
   * - Recibe payload con ids y nombres.
   * - Compara con valores actuales y ejecuta sólo las operaciones necesarias.
   * - Agrupa las llamadas con forkJoin y refresca al finalizar.
   */
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

  /**
   * Abre modal de edición y carga los valores actuales en editForm.
   */
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

  /**
   * Cierra el modal de edición y limpia el formulario.
   */
  closeEditModal() {
    this.editModalOpen = false;
    this.editForm.reset();
    this.editIds = { paisId: null, departamentoId: null, ciudadId: null };
  }

  /**
   * Guarda los cambios desde el modal de edición.
   * Reutiliza la función handleUpdate para aplicar las actualizaciones necesarias.
   */
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