import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { AuthService } from '../../core/services/auth';
import { CommonModule } from '@angular/common';
import { IonContent,  } from '@ionic/angular/standalone';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: true,
  imports: [IonContent, CommonModule]
})
export class SplashPage implements OnInit {

  constructor(private router: Router, private authService: AuthService) { }

  ngOnInit() {
    // show splash for ~3s then navigate according to auth state
    setTimeout(() => {
      const auth = getAuth();
      onAuthStateChanged(auth, (user) => {
        if (user) {
          this.router.navigateByUrl('/home', { replaceUrl: true });
        } else {
          this.router.navigateByUrl('/login', { replaceUrl: true });
        }
      });
    }, 3000);
  }

}
