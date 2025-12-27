import { TestBed } from '@angular/core/testing';

import { Pais } from './pais';

describe('Pais', () => {
  let service: Pais;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Pais);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
