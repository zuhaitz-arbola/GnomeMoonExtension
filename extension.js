/**
 * extension.js — Gnome Moon Extension GNOME Shell Extension
 *
 * Renders the current lunar phase in the top panel using St.DrawingArea + Cairo,
 * and displays a detailed pure-Cairo moon diagram with real-time astronomical
 * data (phase, illumination, age, elevation, azimuth, distance) in a popup menu.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib   from 'gi://GLib';
import Gio    from 'gi://Gio';
import GObject from 'gi://GObject';
import St     from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango   from 'gi://Pango';
import Cairo   from 'gi://cairo';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

/* Local lunar calculation module. */
import * as Lunar from './lunar.js';

/* ------------------------------------------------------------------ */
/*  Constants & Dimensions (Matching Gnome Sun Extension 1:1)                    */
/* ------------------------------------------------------------------ */

const TWO_PI  = 2 * Math.PI;
const DEG     = Math.PI / 180;
const HALF_PI = Math.PI / 2;

/* Panel icon dimensions. */
const ICON_W = 22;
const ICON_H = 22;

/* Moon popup diagram dimensions — 1:1 match with Gnome Sun Extension DOME_W & DOME_H. */
const MOON_DIAG_W = 290;
const MOON_DIAG_H = 240;

/* ------------------------------------------------------------------ */
/*  Colour Palette (Neutral GNOME Dark / Crisp Monochromatic)          */
/* ------------------------------------------------------------------ */

const C = {
    /* Diagram background (Pure Black #000000) */
    diagBg:      [0.00, 0.00, 0.00, 1.0],

    /* Moon surface (lit portion — pure white) */
    moonLit:     [1.00, 1.00, 1.00, 1.0],

    /* Moon shadow (dark portion — 100% transparent) */
    moonDark:    [0.00, 0.00, 0.00, 0.0],

    /* Moon rim outline (unified gray #8E95A5) */
    moonRim:     [0.56, 0.58, 0.65, 0.50],
};

/* ------------------------------------------------------------------ */
/*  Phase name translation helper                                      */
/* ------------------------------------------------------------------ */

function getLocalPhaseName(nameKey) {
    const map = {
        'New Moon':         _('New Moon'),
        'Waxing Crescent':  _('Waxing Crescent'),
        'First Quarter':    _('First Quarter'),
        'Waxing Gibbous':   _('Waxing Gibbous'),
        'Full Moon':        _('Full Moon'),
        'Waning Gibbous':   _('Waning Gibbous'),
        'Last Quarter':     _('Last Quarter'),
        'Waning Crescent':  _('Waning Crescent'),
    };
    return map[nameKey] || nameKey;
}

/* ------------------------------------------------------------------ */
/*  MoonIndicator — PanelMenu.Button subclass                          */
/* ------------------------------------------------------------------ */

const MoonIndicator = GObject.registerClass(
class MoonIndicator extends PanelMenu.Button {

    _init(ext) {
        super._init(0.5, 'Gnome Moon Extension');
        this.add_style_class_name("gnomemoon-panel-button");

        this._ext       = ext;
        this._settings  = ext.getSettings();
        this._lunarData = null;
        this._timerId   = 0;

        /* ----- Panel Icon (Top Bar) ----- */
        this._panelIcon = new St.DrawingArea({
            style_class: 'gnomemoon-panel-icon',
            width:  ICON_W,
            height: ICON_H,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelIcon.connect('repaint', (area) => this._drawPanelIcon(area));
        this.add_child(this._panelIcon);

        /* ----- Popup Menu Construction ----- */
        this._buildPopupMenu();

        /* ----- Settings Signals ----- */
        this._settingsIds = [
            this._settings.connect('changed::latitude',         () => this._update()),
            this._settings.connect('changed::longitude',        () => this._update()),
            this._settings.connect('changed::refresh-interval', () => this._restartTimer()),
        ];

        /* ----- Theme Detection (GNOME Official Light/Dark Mode) ----- */
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._themeSettingsId = this._interfaceSettings.connect(
            'changed::color-scheme',
            () => this._updateTheme()
        );
        this._updateTheme();

        /* ----- Moon Texture ----- */
        try {
            this._moonTexture = Cairo.ImageSurface.createFromPNG(this._ext.path + '/moon_texture.png');
        } catch (e) {
            this._moonTexture = null;
        }

        /* ----- Initial Update & Timer ----- */
        this._update();
        this._startTimer();
    }

    /* ============================================================== */
    /*  Popup Menu Construction                                       */
    /* ============================================================== */

    _buildPopupMenu() {
        /* 1. Pure Cairo Moon Diagram (Dimensions matching Gnome Sun Extension 1:1) */
        this._moonArea = new St.DrawingArea({
            style_class: 'gnomemoon-moon-diagram',
            width:  MOON_DIAG_W,
            height: MOON_DIAG_H,
        });
        this._moonArea.connect('repaint', (area) => this._drawMoonDiagram(area));

        const diagItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        diagItem.add_child(this._moonArea);
        this.menu.addMenuItem(diagItem);

        /* Separator */
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /* 3. Technical Info Rows Container */
        this._infoBox = new St.BoxLayout({
            vertical: true,
            style_class: 'gnomemoon-info-box',
            x_expand: true,
        });
        const infoItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        infoItem.add_child(this._infoBox);
        this.menu.addMenuItem(infoItem);

        /* Top Status Card ("Horizontearen gainean") inside infoBox */
        this._statusContainer = new St.BoxLayout({
            style_class: 'gnomeastro-visible-badge',
            width: 232,
            clip_to_allocation: true,
        });
        this._statusHeader = new St.Label({
            style_class: 'gnomeastro-badge-header',
            x_expand: true,
        });
        this._statusHeader.clutter_text.line_wrap = false;
        this._statusContainer.add_child(this._statusHeader);
        this._infoBox.add_child(this._statusContainer);

        /* Create Technical Info Rows */
        this._rows = {};
        const fields = [
            ['phase',        _('Phase')],
            ['illumination', _('Illumination')],
            ['age',          _('Moon Age')],
            ['distance',     _('Distance')],
            ['elevation',    _('Elevation')],
            ['azimuth',      _('Azimuth')],
        ];
        for (const [key, label] of fields) {
            const row = new St.BoxLayout({style_class: 'gnomemoon-info-row', x_expand: true});
            const lbl = new St.Label({style_class: 'gnomemoon-info-label', text: label, x_expand: true, x_align: Clutter.ActorAlign.START});
            const val = new St.Label({style_class: 'gnomemoon-info-value', text: '—', x_expand: true, x_align: Clutter.ActorAlign.END});
            row.add_child(lbl);
            row.add_child(val);
            this._infoBox.add_child(row);
            this._rows[key] = val;
        }

        /* Separator before footer block */
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        /* Circular Icon Buttons Row (Help + Settings) - GNOME Quick Settings style */
        const footerRow = new St.BoxLayout({
            style_class: 'gnomeastro-footer-row',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });

        /* 1. Help Circular Button */
        const helpBtn = new St.Button({
            style_class: 'gnomeastro-footer-btn',
            child: new St.Icon({
                icon_name: 'help-about-symbolic',
                icon_size: 16,
            }),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        helpBtn.connect('clicked', () => {
            try {
                GLib.file_set_contents('/tmp/gnome_astro_tab.txt', 'help');
            } catch (e) {}
            this._ext.openPreferences();
        });

        /* 2. Settings Circular Button */
        const settingsBtn = new St.Button({
            style_class: 'gnomeastro-footer-btn',
            child: new St.Icon({
                icon_name: 'emblem-system-symbolic',
                icon_size: 16,
            }),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        settingsBtn.connect('clicked', () => {
            try {
                GLib.file_set_contents('/tmp/gnome_astro_tab.txt', 'config');
            } catch (e) {}
            this._ext.openPreferences();
        });

        footerRow.add_child(helpBtn);
        footerRow.add_child(settingsBtn);

        const footerItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        footerItem.add_child(footerRow);
        this.menu.addMenuItem(footerItem);

        /* Fade-in popover & Heartbeat timer */
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this.menu.box.opacity = 0;
                this.menu.box.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                
                this._heartbeatId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                    if (this._moonArea) this._moonArea.queue_repaint();
                    return GLib.SOURCE_CONTINUE;
                });
            } else {
                if (this._heartbeatId) {
                    GLib.source_remove(this._heartbeatId);
                    this._heartbeatId = null;
                }
            }
        });
    }

    /* ============================================================== */
    /*  Theme Detection                                               */
    /* ============================================================== */

    _isLightMode() {
        try {
            const scheme = this._interfaceSettings.get_string('color-scheme');
            return scheme === 'prefer-light' || scheme === 'default';
        } catch (e) {
            return false;
        }
    }

    _updateTheme() {
        const isLight = this._isLightMode();
        if (isLight) {
            this.add_style_class_name('light-mode');
            this.remove_style_class_name('dark-mode');
            if (this.menu && this.menu.box) {
                this.menu.box.add_style_class_name('light-mode');
                this.menu.box.remove_style_class_name('dark-mode');
            }
        } else {
            this.add_style_class_name('dark-mode');
            this.remove_style_class_name('light-mode');
            if (this.menu && this.menu.box) {
                this.menu.box.add_style_class_name('dark-mode');
                this.menu.box.remove_style_class_name('light-mode');
            }
        }
        if (this._panelIcon) this._panelIcon.queue_repaint();
        if (this._moonArea) this._moonArea.queue_repaint();
    }

    /* ============================================================== */
    /*  Timer Management                                              */
    /* ============================================================== */

    _startTimer() {
        if (this._timerId)
            return;
        const interval = this._settings.get_int('refresh-interval');
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, interval, () => {
                this._update();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _restartTimer() {
        this._stopTimer();
        this._startTimer();
    }

    /* ============================================================== */
    /*  Data Update                                                   */
    /* ============================================================== */

    _isConfigured() {
        const lat = this._settings.get_double('latitude');
        const lon = this._settings.get_double('longitude');
        return (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180);
    }

    _update() {
        if (!this._isConfigured()) {
            this._lunarData = null;
            this._statusHeader.set_style_class_name('gnomemoon-status-label');
            this._statusHeader.set_text(_('Coordinates not configured'));
            this._infoBox.hide();
        } else {
            const lat = this._settings.get_double('latitude');
            const lon = this._settings.get_double('longitude');
            this._lunarData = Lunar.getLunarData(lat, lon, new Date());

            const d = this._lunarData;
            const phaseTrans = getLocalPhaseName(d.phaseName);

            /* Top Status Card (single continuous line). */
                        const isAbove = d.elevation > 0;
            let statusText = isAbove ? _("Moon above horizon") : _("Moon below horizon");
            this._statusHeader.set_text(statusText);

            /* Technical info fields */
            this._infoBox.show();
            this._rows.phase.set_text(phaseTrans);
            this._rows.illumination.set_text(`${(d.illumination * 100).toFixed(1)}%`);
            this._rows.age.set_text(`${d.age.toFixed(1)} ${_('days')}`);
            this._rows.elevation.set_text(`${d.elevation.toFixed(2)}°`);
            this._rows.azimuth.set_text(`${d.azimuth.toFixed(2)}°`);
            this._rows.distance.set_text(`${Math.round(d.distance).toLocaleString()} km`);
        }

        /* Trigger repaint */
        this._panelIcon.queue_repaint();
        this._moonArea.queue_repaint();
    }

    /* ============================================================== */
    /*  Cairo: Panel Icon (Top Bar - Small Vector Moon)                */
    /* ============================================================== */

    _drawPanelIcon(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();

        const cx = w / 2;
        const cy = h / 2;
        const R  = 7.0;

        cr.setOperator(0); // CLEAR
        cr.paint();
        cr.setOperator(2); // OVER

        if (!this._lunarData) {
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.35);
            cr.setLineWidth(1.4);
            cr.arc(cx, cy, R, 0, TWO_PI);
            cr.stroke();
            cr.$dispose();
            return;
        }

        const alpha = (this._lunarData.elevation > 0) ? 1.0 : 0.35;
        this._drawMoonPhase(cr, cx, cy, R, this._lunarData.phaseAngle, alpha);

        cr.$dispose();
    }

    /* ============================================================== */
    /*  Cairo: Moon Diagram (Popup — Neutral GNOME Dark Palette)       */
    /* ============================================================== */

    _drawMoonDiagram(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();

        cr.setOperator(0); // CLEAR
        cr.paint();
        cr.setOperator(2); // OVER

        /* Background container (GNOME Official Palette: #000000 dark / #b8b8b8 light) */
        const isLight = this._isLightMode();
        if (isLight) {
            cr.setSourceRGBA(0.72, 0.72, 0.72, 1.0);
        } else {
            cr.setSourceRGBA(...C.diagBg);
        }
        const bgR = 10;
        cr.newPath();
        cr.arc(bgR,     bgR,     bgR, Math.PI, 1.5 * Math.PI);
        cr.arc(w - bgR, bgR,     bgR, 1.5 * Math.PI, TWO_PI);
        cr.arc(w - bgR, h - bgR, bgR, 0, 0.5 * Math.PI);
        cr.arc(bgR,     h - bgR, bgR, 0.5 * Math.PI, Math.PI);
        cr.closePath();
        cr.fill();

        /* Center and Radius (88px radius) */
        const cx = w / 2;
        const cy = h / 2;
        const R  = Math.min(w, h) / 2 - 32;

        if (!this._lunarData) {
            cr.setSourceRGBA(0.6, 0.6, 0.6, 0.5);
            cr.selectFontFace('Sans', 0, 1);
            cr.setFontSize(28);
            const ext = cr.textExtents('?');
            cr.moveTo(cx - ext.width / 2, cy + ext.height / 2);
            cr.showText('?');
            cr.$dispose();
            return;
        }

        const d = this._lunarData;

        /* Draw clean vector moon phase disc */
        this._drawMoonPhaseDiagram(cr, cx, cy, R, d.phaseAngle);



        /* Heartbeat indicator */
        const hbAlpha = 0.325 + 0.175 * Math.sin(Date.now() / 1000 * Math.PI);
        if (isLight) {
            cr.setSourceRGBA(0.18, 0.20, 0.21, hbAlpha);
        } else {
            cr.setSourceRGBA(1.0, 1.0, 1.0, hbAlpha);
        }
        cr.arc(w - 12, h - 12, 2.5, 0, TWO_PI);
        cr.fill();

        cr.$dispose();
    }

    /* ============================================================== */
    /*  Cairo: Paint NASA moon texture into current clip               */
    /* ============================================================== */

    _paintMoonTexture(cr, cx, cy, R) {
        if (!this._moonTexture) return;
        cr.save();
        cr.translate(cx - R, cy - R);
        cr.scale((R * 2) / 512, (R * 2) / 512);
        cr.setSourceSurface(this._moonTexture, 0, 0);
        cr.paint();
        cr.restore();
    }

    /* ============================================================== */
    /*  Cairo: Moon Diagram rendering                                 */
    /* ============================================================== */

    _drawMoonPhaseDiagram(cr, cx, cy, R, phaseAngleDeg) {
        const pa = ((phaseAngleDeg % 360) + 360) % 360;
        const cosPa = Math.cos(pa * DEG);
        const STEPS = 30;

        /* 1. FULL TEXTURE BASE (for Earthshine) */
        cr.save();
        cr.arc(cx, cy, R, 0, TWO_PI);
        cr.clip();
        if (this._moonTexture) {
            this._paintMoonTexture(cr, cx, cy, R);
        } else {
            cr.setSourceRGBA(...C.moonLit);
            cr.fill();
        }
        cr.restore();

        /* 2. EARTHSHINE MASK (Dark Side — strictly clipped to moon circle R) */
        cr.save();
        cr.arc(cx, cy, R, 0, TWO_PI);
        cr.clip();
        cr.newPath();
        const maskR = R + 2;

        if (pa <= 180) {
            cr.arc(cx, cy, maskR, HALF_PI, 3 * HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = -HALF_PI + (i / STEPS) * Math.PI;
                const x = cx + cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        } else {
            cr.arc(cx, cy, maskR, -HALF_PI, HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = HALF_PI - (i / STEPS) * Math.PI;
                const x = cx - cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        }
        cr.closePath();
        cr.setSourceRGBA(0, 0, 0, 0.88); // 88% black allows 12% texture through
        cr.fill();
        cr.restore();

        /* 3. TERMINATOR PENUMBRA (Wide soft shadow clipped strictly to dark region) */
        cr.save();
        cr.arc(cx, cy, R, 0, TWO_PI);
        cr.clip();

        /* Clip to dark side region so penumbra stroke never bleeds into lit moon surface */
        cr.newPath();
        if (pa <= 180) {
            cr.arc(cx, cy, maskR, HALF_PI, 3 * HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = -HALF_PI + (i / STEPS) * Math.PI;
                const x = cx + cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        } else {
            cr.arc(cx, cy, maskR, -HALF_PI, HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = HALF_PI - (i / STEPS) * Math.PI;
                const x = cx - cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        }
        cr.closePath();
        cr.clip();

        /* Draw penumbra stroke along terminator inside dark region */
        cr.newPath();
        if (pa <= 180) {
            for (let i = 0; i <= STEPS; i++) {
                const a = -HALF_PI + (i / STEPS) * Math.PI;
                const x = cx + cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                if (i === 0) cr.moveTo(x, y);
                else cr.lineTo(x, y);
            }
        } else {
            for (let i = 0; i <= STEPS; i++) {
                const a = HALF_PI - (i / STEPS) * Math.PI;
                const x = cx - cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                if (i === 0) cr.moveTo(x, y);
                else cr.lineTo(x, y);
            }
        }
        
        cr.setSourceRGBA(0, 0, 0, 0.15); cr.setLineWidth(8.0); cr.strokePreserve();
        cr.setSourceRGBA(0, 0, 0, 0.25); cr.setLineWidth(5.0); cr.strokePreserve();
        cr.setSourceRGBA(0, 0, 0, 0.40); cr.setLineWidth(3.0); cr.strokePreserve();
        cr.setSourceRGBA(0, 0, 0, 0.70); cr.setLineWidth(1.0); cr.stroke();

        cr.restore(); // end clip for penumbra
    }

    /* ============================================================== */
    /*  Cairo: Panel Icon Vector Phase Shape                          */
    /* ============================================================== */

    _drawMoonPhase(cr, cx, cy, R, phaseAngleDeg, alpha) {
        const pa = ((phaseAngleDeg % 360) + 360) % 360;
        const cosPa = Math.cos(pa * DEG);
        const STEPS = 30;

        /* 1. Main circle clip */
        cr.save();
        cr.arc(cx, cy, R, 0, TWO_PI);
        cr.clip();

        /* 2. Build single continuous path for illuminated moon portion */
        cr.newPath();

        if (pa <= 180) {
            cr.arc(cx, cy, R, -HALF_PI, HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = HALF_PI - (i / STEPS) * Math.PI;
                const x = cx + cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        } else {
            cr.arc(cx, cy, R, HALF_PI, 3 * HALF_PI);
            for (let i = 0; i <= STEPS; i++) {
                const a = -HALF_PI + (i / STEPS) * Math.PI;
                const x = cx - cosPa * R * Math.cos(a);
                const y = cy + R * Math.sin(a);
                cr.lineTo(x, y);
            }
        }

        cr.closePath();

        /* Fill lit surface */
        cr.setSourceRGBA(1.0, 1.0, 1.0, alpha);
        cr.fill();

        cr.restore();

        /* Crisp white rim outline matching Gnome Sun Extension (1.0px) 1:1 */
        cr.setSourceRGBA(1.0, 1.0, 1.0, alpha * 0.90);
        cr.setLineWidth(1.0);
        cr.arc(cx, cy, R, 0, TWO_PI);
        cr.stroke();
    }

    destroy() {
        if (this._themeSettingsId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._themeSettingsId);
            this._themeSettingsId = 0;
        }
        this._stopTimer();
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        super.destroy();
    }
});

/* ================================================================== */
/*  Extension Entry Point                                             */
/* ================================================================== */

export default class GnomeMoonExtension extends Extension {

    enable() {
        this.initTranslations();
        this._indicator = new MoonIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._orderTrio();
    }

    _orderTrio() {
        try {
            const rightBox = Main.panel._rightBox;
            const sa = Main.panel.statusArea;

            const sunActor = (sa['gnomesunextension@aiurri.xyz'] || sa['gnomesun@aiurri.xyz'])?.container ||
                             (sa['gnomesunextension@aiurri.xyz'] || sa['gnomesun@aiurri.xyz']);
            const moonActor = (sa['gnomemoonextension@aiurri.xyz'] || sa['gnomemoon@aiurri.xyz'])?.container ||
                              (sa['gnomemoonextension@aiurri.xyz'] || sa['gnomemoon@aiurri.xyz']);
            const planActor = (sa['gnomeplanetariumextension@aiurri.xyz'] || sa['gnomeorrery@aiurri.xyz'])?.container ||
                              (sa['gnomeplanetariumextension@aiurri.xyz'] || sa['gnomeorrery@aiurri.xyz']);

            if (sunActor && moonActor)
                rightBox.set_child_above_sibling(moonActor, sunActor);
            if (moonActor && planActor)
                rightBox.set_child_above_sibling(planActor, moonActor);
            else if (sunActor && planActor)
                rightBox.set_child_above_sibling(planActor, sunActor);
        } catch (e) {}
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
