import { Component, NgZone } from '@angular/core';
import { IonicModule, Platform } from '@ionic/angular';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [IonicModule, RouterModule]
})
export class AppComponent {
  constructor(private platform: Platform, private router: Router, private ngZone: NgZone) {
    this.initializeApp();
    this.setupFocusManagement();
  }

  private initializeApp() {
    this.platform.ready().then(() => {
      // Explicitly navigate to the splash page on startup.
      // The `splash` page itself handles the transition to /login after its timer.
      this.router.navigateByUrl('/splash');
    });
  }

  private setupFocusManagement() {
    // Move focus to active ion-content (last rendered) after navigation
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => {
          const outlet = document.querySelector('ion-router-outlet');
          const contents = outlet ? outlet.querySelectorAll('ion-content') : document.querySelectorAll('ion-content');
          const activeContent = contents && contents.length ? contents[contents.length - 1] as HTMLElement : null;
          if (activeContent) {
            const ae = document.activeElement as HTMLElement | null;
            if (ae && ae !== activeContent && !activeContent.contains(ae)) {
              try { ae.blur(); } catch {}
            }
            const target = activeContent.querySelector('h1, h2, .section-title') as HTMLElement || activeContent;
            if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            try { (target || activeContent).focus(); } catch {}
          }
        }, 40);
      });
    });
  }
}
