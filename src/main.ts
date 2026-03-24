import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HttpClientJsonpModule } from '@angular/common/http';
import { IonicStorageModule } from '@ionic/storage-angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

// Ícones
import {
  play,
  pause,
  heart,
  heartOutline,
  musicalNotesOutline,
  homeOutline,
  personOutline,
  personCircleOutline,
  close,
  person,
  eyeOutline,
  eyeOffOutline,
  logOutOutline,
  mailOutline,
  lockClosedOutline,
  arrowBackOutline
} from 'ionicons/icons';

import { addIcons } from 'ionicons';

// Registrar os ícones — ESSENCIAL
addIcons({
  play,
  pause,
  heart,
  heartOutline,
  musicalNotesOutline,
  homeOutline,
  personOutline,
  personCircleOutline,
  close,
  person,
  eyeOutline,
  eyeOffOutline,
  logOutOutline,
  mailOutline,
  lockClosedOutline,
  arrowBackOutline
});



bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    importProvidersFrom(
      IonicModule.forRoot(),
      FormsModule,
      HttpClientModule,
      HttpClientJsonpModule,
      IonicStorageModule.forRoot()
    )
  ]
});
