import { TestBed } from '@angular/core/testing';

import { Ciudad } from './ciudad';

describe('Ciudad', () => {
  let service: Ciudad;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ciudad);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
