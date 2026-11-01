import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const PATHS: Record<string, string> = {
  search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  briefcase: 'M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2Zm0 3h6V5H9v1Zm-5 2v3h16V8H4Zm0 5v5h16v-5h-7v1h-2v-1H4Z',
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1Zm1 2v1h4V4h-4ZM6 6v14h12V6h-2v1H8V6H6Zm2 4h8v2H8v-2Zm0 4h6v2H8v-2Z',
  chart: 'M4 3h2v16h15v2H4V3Zm4 9h3v5H8v-5Zm5-4h3v9h-3V8Zm5 3h3v6h-3v-6Z',
  user: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 10c4.4 0 8 2.2 8 5v3H4v-3c0-2.8 3.6-5 8-5Zm0 2c-3.5 0-6 1.6-6 3v1h12v-1c0-1.4-2.5-3-6-3Z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-5h0l1 3h-2l1-3Zm0 17 1 3h-2l1-3ZM2 12l3-1v2l-3-1Zm17 0 3-1v2l-3-1ZM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8Zm12.8 12.8 2.8 1.4-1.4 1.4-1.4-2.8ZM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4ZM17.7 6.3l1.4-2.8-1.4 1.4Z',
  moon: 'M14.5 2.5A9.5 9.5 0 1 0 21.5 15 7.5 7.5 0 0 1 14.5 2.5Z',
  monitor: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8v2h3v2H8v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6H4Z',
  x: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  external: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Zm1 2v12.6l5-2.9 5 2.9V5H7Z',
  pin: 'M12 2a7 7 0 0 1 7 7c0 5.2-7 13-7 13S5 14.2 5 9a7 7 0 0 1 7-7Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  check: 'm9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4-9.6 9.6Z',
  alert: 'M12 2 1 21h22L12 2Zm0 5 7.5 12h-15L12 7Zm-1 3v4h2v-4h-2Zm0 5v2h2v-2h-2Z',
  code: 'm8.6 16.6-4.6-4.6 4.6-4.6L7.2 6 1.2 12l6 6 1.4-1.4Zm6.8 0 4.6-4.6-4.6-4.6L16.8 6l6 6-6 6-1.4-1.4Z',
  filter: 'M3 5h18v2l-7 7v6l-4-2v-4L3 7V5Z',
  arrowLeft: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z',
  upload: 'M12 3 7 8h3v6h4V8h3l-5-5ZM5 18h14v2H5v-2Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z',
  north: 'M12 2 6 22l6-4 6 4-6-20Z',
  menu: 'M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z',
  home: 'M12 3 2 11h3v9h6v-6h2v6h6v-9h3L12 3Z',
  arrowUp: 'M11 20V7.8l-5.6 5.6L4 12l8-8 8 8-1.4 1.4L13 7.8V20h-2Z',
  target: 'M11 2h2v2.1A8 8 0 0 1 19.9 11H22v2h-2.1A8 8 0 0 1 13 19.9V22h-2v-2.1A8 8 0 0 1 4.1 13H2v-2h2.1A8 8 0 0 1 11 4.1V2Zm1 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  laptop: 'M4 5h16a1 1 0 0 1 1 1v10h2v2H1v-2h2V6a1 1 0 0 1 1-1Zm1 2v9h14V7H5Z',
  building: 'M4 3h10a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v11H3V4a1 1 0 0 1 1-1Zm1 2v14h3v-3h4v3h1V5H5Zm10 6v8h4v-8h-4ZM7 7h2v2H7V7Zm4 0h2v2h-2V7Zm-4 4h2v2H7v-2Zm4 0h2v2h-2v-2Z',
  sliders: 'M4 6h9.2a3 3 0 0 1 5.6 0H20v2h-1.2a3 3 0 0 1-5.6 0H4V6Zm12 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM4 16h1.2a3 3 0 0 1 5.6 0H20v2h-9.2a3 3 0 0 1-5.6 0H4v-2Zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  refresh: 'M12 4a8 8 0 0 1 7.4 5H17v2h6V5h-2v2.3A10 10 0 1 0 22 12h-2a8 8 0 1 1-8-8Z',
  download: 'M11 3h2v9.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4 3.6 3.6V3ZM5 18h14v2H5v-2Z',
  doc: 'M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm0 2.2 6 2.2V11c0 3.9-2.5 7.5-6 8.8-3.5-1.3-6-4.9-6-8.8V6.4l6-2.2Z',
  key: 'M14 3a7 7 0 1 1-6.3 10H6v2H4v2H2v-4l5.7-5.7A7 7 0 0 1 14 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm1 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path [attr.d]="d()" fill="currentColor" /></svg>`,
  styles: `:host { display: inline-flex; line-height: 0; }`,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(20);
  protected readonly d = computed(() => PATHS[this.name()] ?? '');
}
