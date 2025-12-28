import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
  // NUEVOS ARRAYS para los selects
  departamentosSelect: any[] = [];
  ciudadesSelect: any[] = [];
  tablaAll: any[] = [];
  tablaFiltered: any[] = [];

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
    private ciudadService: Ciudad,
    private cd: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      paisId: [null],
      departamentoId: [{ value: null, disabled: true }], 
      nombreDepartamento: [''],
      nombreCiudad: [''],
      nombrePais: [''],
      filter: ['']
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
        // Inicializar selects con todos los datos (vacío si no hay selección)
        this.departamentosSelect = [];
        this.ciudadesSelect = [];
        // cargar banderas para los paises 
        this.loadFlagsForPaises();
        this.buildTabla();
        this.cd.detectChanges(); // <--- forzar actualización
        console.log('Datos refrescados:', { paises, departamentos, ciudades });
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
    this.cd.detectChanges(); 
  }

  /**
   * Carga la bandera para un solo país (no bloqueante para el UI).
   */
  private async fetchFlagForPais(p: any) {
		try {
			const name = encodeURIComponent((p.nombre ?? p.Nombre ?? '').trim());
			if (!name) return;
			const url = `https://restcountries.com/v3.1/name/${name}?fields=flags,name`;
			const resp = await fetch(url);
			if (!resp.ok) return;
			const data = await resp.json();
			if (Array.isArray(data) && data[0]?.flags) {
				p.flagUrl = data[0].flags.png ?? data[0].flags.svg ?? '';
				this.buildTabla();
			}
		} catch (e) {
			console.warn('flag fetch failed for', p, e);
		}
	}

  /**
   * Construye la estructura usada por la vista de tabla combinada.
   * Cada fila incluye: paisId, paisNombre, paisFlag, departamentoId, departamentoNombre, ciudadId, ciudadNombre.
   */
  // build tabla combinada (pais - departamento - ciudad)
  buildTabla() {
    this.tablaAll = (this.ciudades || []).map(c => {
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
    // aplicar filtro actual al reconstruir
    this.applyFilter();
  }

  onPaisChange() {
    const paisId = this.form.get('paisId')?.value;
    const depControl = this.form.get('departamentoId');

    if (!paisId) {
      this.departamentosSelect = [];
      this.ciudadesSelect = [];
      depControl?.reset(null, { emitEvent: false });
      depControl?.disable({ emitEvent: false }); 
      return;
    }

    const id = Number(paisId);
    depControl?.enable({ emitEvent: false }); 
    depControl?.reset(null, { emitEvent: false });

    // Filtrar departamentos solo del país seleccionado
    this.departamentosSelect = (this.departamentos || []).filter(d => (d.paisId ?? d.PaisId) == id);

    // Limpiar ciudades del select
    this.ciudadesSelect = [];
    this.cd.detectChanges();
  }

  onDepartamentoChange() {
    const depId = this.form.get('departamentoId')?.value;
    if (!depId) {
      this.ciudadesSelect = [];
      return;
    }

    const id = Number(depId);
    // Filtrar ciudades para el select
    this.ciudadesSelect = (this.ciudades || []).filter(c => (c.departamentoId ?? c.DepartamentoId) == id);
  }

  /**
   * Crear un país nuevo usando el control nombrePais del formulario.
   * Muestra mensajes de éxito/error y refresca la lista local al completar.
   */
  crearPais() {
		const nombre = this.form.get('nombrePais')?.value?.trim();
		if (!nombre) return;

		// validación: no números ni caracteres especiales
		if (!this.isValidText(nombre)) {
			this.errorMessage = 'No se permiten números ni caracteres especiales';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		// validación: no duplicados
		if (this.existsPais(nombre)) {
			this.errorMessage = 'El país ya existe';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		const data = { nombre: nombre };

		this.loadingPais = true;
    this.paisService.create(data).pipe(
    finalize(() => {
      this.loadingPais = false;
      this.cd.detectChanges(); // <--- forzar actualización
    })
  ).subscribe({
    next: (res: any) => {
      this.successMessage = 'País creado correctamente';
      this.form.patchValue({ nombrePais: '' });
      this.refreshAll();
      this.cd.detectChanges(); // <--- forzar actualización
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

		// validación
		if (!this.isValidText(nombre)) {
			this.errorMessage = 'No se permiten números ni caracteres especiales';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		// validación: no duplicados dentro del mismo país
		const pid = Number(paisId);
		if (this.existsDepartamento(nombre, pid)) {
			this.errorMessage = 'El departamento ya existe en este país';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		const data = {
			nombre: nombre,
			paisId: pid
		};

    this.loadingDepartamento = true;
    this.departamentoService.create(data).pipe(
      finalize(() => {
        this.loadingDepartamento = false;
        this.cd.detectChanges(); // <--- forzar actualización
      })
    ).subscribe({
      next: (res: any) => {
        this.successMessage = 'Departamento creado correctamente';
        this.form.patchValue({ nombreDepartamento: '' });
        this.refreshAll();
        this.cd.detectChanges(); // <--- forzar actualización
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

		// validación
		if (!this.isValidText(nombre)) {
			this.errorMessage = 'No se permiten números ni caracteres especiales';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		// validación: no duplicados dentro del mismo departamento
		const did = Number(departamentoId);
		if (this.existsCiudad(nombre, did)) {
			this.errorMessage = 'La ciudad ya existe en este departamento';
			setTimeout(() => this.errorMessage = null, 4000);
			return;
		}

		const data = {
			nombre: nombre,
			departamentoId: did
		};

		this.loadingCiudad = true;
    this.ciudadService.create(data).pipe(
      finalize(() => {
        this.loadingCiudad = false;
        this.cd.detectChanges(); // <--- forzar actualización
      })
    ).subscribe({
      next: (res: any) => {
        this.successMessage = 'Ciudad creada correctamente';
        this.form.patchValue({ nombreCiudad: '' });
        this.refreshAll();
        this.cd.detectChanges(); // <--- forzar actualización
      },
      error: (err) => {
				console.error('crearCiudad error:', err);
				this.errorMessage = 'Error al guardar ciudad';
				setTimeout(() => this.errorMessage = null, 4000);
			}
		});
	}

  deleteModalOpen = false;
  deleteIds: { paisId: number | null, departamentoId: number | null, ciudadId: number | null } = { paisId: null, departamentoId: null, ciudadId: null };
  deleteNames: { paisNombre?: string, departamentoNombre?: string, ciudadNombre?: string } = {};
  deleteWarning: string = '';

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
    const paisNombre = this.editForm.get('paisNombre')?.value?.trim() ?? '';
    const departamentoNombre = this.editForm.get('departamentoNombre')?.value?.trim() ?? '';
    const ciudadNombre = this.editForm.get('ciudadNombre')?.value?.trim() ?? '';

    // validar cada campo no vacío que intente guardarse
    if (paisNombre && !this.isValidText(paisNombre)) {
      this.errorMessage = 'No se permiten números ni caracteres especiales';
      setTimeout(() => this.errorMessage = null, 4000);
      return;
    }
    if (departamentoNombre && !this.isValidText(departamentoNombre)) {
      this.errorMessage = 'No se permiten números ni caracteres especiales';
      setTimeout(() => this.errorMessage = null, 4000);
      return;
    }
    if (ciudadNombre && !this.isValidText(ciudadNombre)) {
      this.errorMessage = 'No se permiten números ni caracteres especiales';
      setTimeout(() => this.errorMessage = null, 4000);
      return;
    }

    // comprobaciones de duplicados al editar (excluir id actual)
    // país
    if (paisNombre && this.editIds.paisId != null && this.existsPais(paisNombre, this.editIds.paisId)) {
      this.errorMessage = 'El país ya existe';
      setTimeout(() => this.errorMessage = null, 4000);
      return;
    }
    // departamento (necesita paisId asociado; intentar obtenerlo desde lista si no se cambió)
    if (departamentoNombre && this.editIds.departamentoId != null) {
      const currentDep = (this.departamentos || []).find(d => d.id === this.editIds.departamentoId);
      const paisIdForDep = currentDep ? (currentDep.paisId ?? currentDep.PaisId) : this.editIds.paisId ?? null;
      if (paisIdForDep == null) {
        // no se puede validar correctamente, dejar pasar o bloquear; bloquear por seguridad
        this.errorMessage = 'No se pudo validar duplicados de departamento';
        setTimeout(() => this.errorMessage = null, 4000);
        return;
      }
      if (this.existsDepartamento(departamentoNombre, Number(paisIdForDep), this.editIds.departamentoId)) {
        this.errorMessage = 'El departamento ya existe en este país';
        setTimeout(() => this.errorMessage = null, 4000);
        return;
      }
    }
    // ciudad (necesita departamentoId)
    if (ciudadNombre && this.editIds.ciudadId != null) {
      const currentCiu = (this.ciudades || []).find(c => c.id === this.editIds.ciudadId);
      const depIdForCiu = currentCiu ? (currentCiu.departamentoId ?? currentCiu.DepartamentoId) : this.editIds.departamentoId ?? null;
      if (depIdForCiu == null) {
        this.errorMessage = 'No se pudo validar duplicados de ciudad';
        setTimeout(() => this.errorMessage = null, 4000);
        return;
      }
      if (this.existsCiudad(ciudadNombre, Number(depIdForCiu), this.editIds.ciudadId)) {
        this.errorMessage = 'La ciudad ya existe en este departamento';
        setTimeout(() => this.errorMessage = null, 4000);
        return;
      }
    }

    const payload = {
      paisId: this.editIds.paisId,
      paisNombre: paisNombre,
      departamentoId: this.editIds.departamentoId,
      departamentoNombre: departamentoNombre,
      ciudadId: this.editIds.ciudadId,
      ciudadNombre: ciudadNombre
    };
    // reutiliza la lógica existente para actualizar solo los que cambiaron
    this.handleUpdate(payload);
    this.closeEditModal();
  }

  openDeleteWindow(r: any) {
    this.deleteIds = {
      paisId: r.paisId ?? null,
      departamentoId: r.departamentoId ?? null,
      ciudadId: r.ciudadId ?? null
    };
    this.deleteNames = {
      paisNombre: r.paisNombre ?? '',
      departamentoNombre: r.departamentoNombre ?? '',
      ciudadNombre: r.ciudadNombre ?? ''
    };
    this.deleteWarning = '';
    this.deleteModalOpen = true;
  }

  closeDeleteModal() {
    this.deleteModalOpen = false;
    this.deleteIds = { paisId: null, departamentoId: null, ciudadId: null };
    this.deleteNames = {};
    this.deleteWarning = '';
  }

  // Elimina solo la ciudad
  deleteOnly(tipo: 'ciudad') {
    this.deleteWarning = '';
    if (!this.deleteIds.ciudadId) return;
    if (!confirm('¿Seguro que desea eliminar la ciudad seleccionada?')) return;
    this.ciudadService.delete(this.deleteIds.ciudadId).subscribe({
      next: () => {
        this.successMessage = 'Ciudad eliminada correctamente';
        this.closeDeleteModal();
        this.refreshAll();
        this.cd.detectChanges();
      },
      error: err => {
        this.errorMessage = 'Error al eliminar ciudad';
        this.closeDeleteModal();
      }
    });
  }

  // Elimina departamento y todas sus ciudades asociadas
  confirmDeleteDepartamento() {
    this.deleteWarning = 'Esta acción eliminará el departamento y todas sus ciudades asociadas.';
    setTimeout(() => {
      if (!this.deleteIds.departamentoId) return;
      if (!confirm('¿Seguro que desea eliminar el departamento y todas sus ciudades asociadas?')) return;
      const ciudades = (this.ciudades || []).filter(c => (c.departamentoId ?? c.DepartamentoId) == this.deleteIds.departamentoId);
      const ciudadDeletes = ciudades.map(c => this.ciudadService.delete(c.id));
      forkJoin(ciudadDeletes.length ? ciudadDeletes : [Promise.resolve()]).subscribe({
        next: () => {
          this.departamentoService.delete(this.deleteIds.departamentoId!).subscribe({
            next: () => {
              this.successMessage = 'Departamento y sus ciudades eliminados correctamente';
              this.closeDeleteModal();
              this.refreshAll();
              this.cd.detectChanges();
            },
            error: err => {
              this.errorMessage = 'Error al eliminar departamento';
              this.closeDeleteModal();
            }
          });
        },
        error: err => {
          this.errorMessage = 'Error al eliminar ciudades del departamento';
          this.closeDeleteModal();
        }
      });
    }, 100);
  }

  // Elimina país y todos sus departamentos y ciudades asociadas
  confirmDeletePais() {
    this.deleteWarning = 'Esta acción eliminará el país, todos sus departamentos y todas sus ciudades asociadas.';
    setTimeout(() => {
      if (!this.deleteIds.paisId) return;
      if (!confirm('¿Seguro que desea eliminar el país y todos sus departamentos y ciudades asociados?')) return;
      const departamentos = (this.departamentos || []).filter(d => (d.paisId ?? d.PaisId) == this.deleteIds.paisId);
      const ciudades = (this.ciudades || []).filter(c => departamentos.some(d => d.id === (c.departamentoId ?? c.DepartamentoId)));
      const ciudadDeletes = ciudades.map(c => this.ciudadService.delete(c.id));
      const departamentoDeletes = departamentos.map(d => this.departamentoService.delete(d.id));
      forkJoin(ciudadDeletes.length ? ciudadDeletes : [Promise.resolve()]).subscribe({
        next: () => {
          forkJoin(departamentoDeletes.length ? departamentoDeletes : [Promise.resolve()]).subscribe({
            next: () => {
              this.paisService.delete(this.deleteIds.paisId!).subscribe({
                next: () => {
                  this.successMessage = 'País, departamentos y ciudades eliminados correctamente';
                  this.closeDeleteModal();
                  this.refreshAll();
                  this.cd.detectChanges();
                },
                error: err => {
                  this.errorMessage = 'Error al eliminar país';
                  this.closeDeleteModal();
                }
              });
            },
            error: err => {
              this.errorMessage = 'Error al eliminar departamentos del país';
              this.closeDeleteModal();
            }
          });
        },
        error: err => {
          this.errorMessage = 'Error al eliminar ciudades del país';
          this.closeDeleteModal();
        }
      });
    }, 100);
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
        this.cd.detectChanges(); // <--- forzar actualización
        setTimeout(() => this.successMessage = null, 3000);
      },
      error: err => {
        console.error('error updating entities', err);
        this.errorMessage = 'Error al actualizar registros';
        setTimeout(() => this.errorMessage = null, 4000);
      }
    });
  }

  // permitir letras (incluye acentos y ñ) y espacios solamente
	private nameRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜüÀ-ÖØ-öø-ÿ\s]+$/;

	private isValidText(v: any): boolean {
		const s = (v ?? '').toString().trim();
		return s.length > 0 && this.nameRegex.test(s);
	}

	// helpers para normalizar y comprobar existencia (pueden excluir un id)
	private normalizeString(v: any): string {
		return (v ?? '').toString().trim().toLowerCase();
	}

	private getEntityName(entity: any): string {
		return this.normalizeString(entity?.nombre ?? entity?.Nombre ?? '');
	}

	private existsPais(nombre: string, excludeId?: number | null): boolean {
		const n = this.normalizeString(nombre);
		return (this.paises || []).some(p => this.getEntityName(p) === n && (excludeId == null || p.id !== excludeId));
	}

	private existsDepartamento(nombre: string, paisId: number, excludeId?: number | null): boolean {
		const n = this.normalizeString(nombre);
		return (this.departamentos || []).some(d => {
			const samePais = (d.paisId ?? d.PaisId) == paisId;
			const sameName = this.normalizeString(d.nombre ?? d.Nombre) === n;
			return samePais && sameName && (excludeId == null || d.id !== excludeId);
		});
	}

	private existsCiudad(nombre: string, departamentoId: number, excludeId?: number | null): boolean {
		const n = this.normalizeString(nombre);
		return (this.ciudades || []).some(c => {
			const sameDep = (c.departamentoId ?? c.DepartamentoId) == departamentoId;
			const sameName = this.normalizeString(c.nombre ?? c.Nombre) === n;
			return sameDep && sameName && (excludeId == null || c.id !== excludeId);
		});
	}

	// método para aplicar filtro desde el input
	applyFilter() {
		const q = (this.form.get('filter')?.value ?? '').toString().trim().toLowerCase();
		if (!q) {
			this.tablaFiltered = [...this.tablaAll];
			return;
		}
		this.tablaFiltered = (this.tablaAll || []).filter(r => {
			return (r.paisNombre ?? '').toString().toLowerCase().includes(q)
				|| (r.departamentoNombre ?? '').toString().toLowerCase().includes(q)
				|| (r.ciudadNombre ?? '').toString().toLowerCase().includes(q);
		});
	}
}