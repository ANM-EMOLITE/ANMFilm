import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SearchBox } from './shared/search-box/search-box';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, SearchBox],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
