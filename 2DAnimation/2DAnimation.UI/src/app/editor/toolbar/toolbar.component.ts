import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { ApiHealthService } from '../../core/api/api-health.service';

type LinkState = 'checking' | 'ok' | 'error';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css'
})
export class ToolbarComponent implements OnInit, OnDestroy {
  private readonly health = inject(ApiHealthService);
  private sub?: Subscription;

  readonly projectName = 'Untitled Project';
  readonly apiState = signal<LinkState>('checking');
  readonly dbState = signal<LinkState>('checking');

  ngOnInit(): void {
    // Poll every 10 s so the status chips follow the backend starting/stopping.
    this.sub = timer(0, 10_000)
      .pipe(
        switchMap(() =>
          this.health.getHealth().pipe(
            catchError(() => of(null))
          )
        )
      )
      .subscribe(result => {
        if (!result) {
          this.apiState.set('error');
          this.dbState.set('error');
          return;
        }
        this.apiState.set(result.api === 'ok' ? 'ok' : 'error');
        this.dbState.set(result.database === 'ok' ? 'ok' : 'error');
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
