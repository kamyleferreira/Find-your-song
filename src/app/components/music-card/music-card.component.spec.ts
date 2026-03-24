import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { MusicCardComponent } from './music-card.component';

describe('MusicCardComponent', () => {
  let component: MusicCardComponent;
  let fixture: ComponentFixture<MusicCardComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [MusicCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MusicCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
