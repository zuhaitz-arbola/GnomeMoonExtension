/**
 * prefs.js — Gnome Moon Extension Preferences Window (Libadwaita)
 *
 * Organized into 3 dedicated Adw.PreferencesPage tabs:
 * 1. Configuración / Konfigurazioa (Coordinates + Refresh)
 * 2. Ayuda / Laguntza (Graph explanation + Glossary)
 * 3. Acerca de / Honi buruz (Lunar tracker inspiration + Credits)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

import GLib from "gi://GLib";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

import {
    ExtensionPreferences,
    gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class GnomeMoonExtensionPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        this.initTranslations();
        const settings = this.getSettings();
        
        /* ============================================================ */
        /*  Page 1: Configuration (Coordinates + Refresh)              */
        /* ============================================================ */

        const configTitle = _('General');

        const configPage = new Adw.PreferencesPage({
            title: configTitle,
            icon_name: 'preferences-system-symbolic',
            name: 'config',
        });
        window.add(configPage);

        /* Coordinates Group */
        const coordGroup = new Adw.PreferencesGroup({
            title: _('Geographic Coordinates'),
            description: _('Enter your latitude and longitude in decimal degrees'),
        });
        configPage.add(coordGroup);

        const latAdj = new Gtk.Adjustment({
            lower: -90,
            upper: 90,
            step_increment: 0.1,
            page_increment: 1,
            value: this._clampedLat(settings),
        });
        const latRow = new Adw.SpinRow({
            title: _('Latitude'),
            subtitle: _('North positive, south negative (−90 … +90)'),
            adjustment: latAdj,
            digits: 4,
        });
        coordGroup.add(latRow);

        const lonAdj = new Gtk.Adjustment({
            lower: -180,
            upper: 180,
            step_increment: 0.1,
            page_increment: 1,
            value: this._clampedLon(settings),
        });
        const lonRow = new Adw.SpinRow({
            title: _('Longitude'),
            subtitle: _('East positive, west negative (−180 … +180)'),
            adjustment: lonAdj,
            digits: 4,
        });
        coordGroup.add(lonRow);

        latAdj.connect('value-changed', () => settings.set_double('latitude', latAdj.get_value()));
        lonAdj.connect('value-changed', () => settings.set_double('longitude', lonAdj.get_value()));

        /* Refresh Group */
        const refreshGroup = new Adw.PreferencesGroup({
            title: _('Refresh'),
            description: _('Control how often the lunar position is recalculated'),
        });
        configPage.add(refreshGroup);

        const intervalAdj = new Gtk.Adjustment({
            lower: 10,
            upper: 600,
            step_increment: 10,
            page_increment: 60,
            value: settings.get_int('refresh-interval'),
        });
        const intervalRow = new Adw.SpinRow({
            title: _('Refresh interval (seconds)'),
            subtitle: _('Lower values increase CPU usage slightly'),
            adjustment: intervalAdj,
            digits: 0,
        });
        refreshGroup.add(intervalRow);

        intervalAdj.connect('value-changed', () => settings.set_int('refresh-interval', intervalAdj.get_value()));

        /* ============================================================ */
        /*  Page 2: Help & Glossary                                      */
        /* ============================================================ */

        const helpTabTitle = _('Help');

        const helpPage = new Adw.PreferencesPage({
            title: helpTabTitle,
            icon_name: 'help-about-symbolic',
            name: 'help',
        });
        window.add(helpPage);

        /* 1. Schematized Diagram Guide Card */
        const guideGroup = new Adw.PreferencesGroup();
        helpPage.add(guideGroup);

        let moonDesc = _("Real-time diagram of the complete lunar cycle with the exact illumination percentage and position data calculated from geographic coordinates. The illuminated area and the earthshine faintly illuminating the night side of the moon are visible.");

        const descRow1 = new Adw.ActionRow({
            title: moonDesc,
        });
        descRow1.title_lines = 0;
        guideGroup.add(descRow1);

        /* 2. Technical Data Glossary Card */
        let moonGlossary = [
            [_("Phase"), _("Visual state of the Moon")],
            [_("Illumination"), _("Percentage of visible surface lit by the Sun")],
            [_("Moon Age"), _("Days elapsed since last New Moon (synodic month)")],
            [_("Distance"), _("Physical distance from Earth to Moon")],
            [_("Elevation"), _("Vertical angle above horizon (0° to 90°)")],
            [_("Azimuth"), _("Horizontal direction from North (0° to 360°)")],
        ];

        moonGlossary.sort((a, b) => a[0].localeCompare(b[0]));

        const glossaryGroup = new Adw.PreferencesGroup();
        helpPage.add(glossaryGroup);

        for (const [term, def] of moonGlossary) {
            const row = new Adw.ActionRow({
                title: `${term}\n<span color="#9a9996">${def}</span>`,
                use_markup: true,
            });
            row.title_lines = 0;
            glossaryGroup.add(row);
        }

        /* ============================================================ */
        /*  Page 3: About (Honi buruz / Acerca de)                       */
        /* ============================================================ */

        const aboutTabTitle = _('About');

        const aboutPage = new Adw.PreferencesPage({
            title: aboutTabTitle,
            icon_name: 'info-symbolic',
            name: 'about',
        });
        window.add(aboutPage);

        let extTitle = _("Gnome Moon Extension");
        let appSubtitle = _("Real-time calculation and representation of the lunar phase and associated astronomical data.") + "\n\n" + _("Part of Jakin | Athenaeum, a free knowledge desktop ecosystem for science, philosophy, and art.");

        const aboutGroup = new Adw.PreferencesGroup();
        aboutPage.add(aboutGroup);

        const titleLabel = new Gtk.Label({
            label: `<span size="x-large" font_weight="bold">${extTitle}</span>`,
            use_markup: true,
            justify: Gtk.Justification.CENTER,
            margin_top: 18,
            margin_bottom: 36,
        });
        aboutGroup.add(titleLabel);

        const appRow = new Adw.ActionRow({
            title: `<span color="#9a9996">${appSubtitle}</span>`,
            use_markup: true,
        });
        appRow.title_lines = 0;
        aboutGroup.add(appRow);

        window.set_default_size(520, 580);

        /* Navigate to requested tab if triggered by Help/Settings button */
        try {
            const [ok, content] = GLib.file_get_contents('/tmp/gnome_astro_tab.txt');
            if (ok) {
                const targetTab = new TextDecoder().decode(content).trim();
                if (targetTab && (targetTab === 'help' || targetTab === 'config' || targetTab === 'about')) {
                    window.set_visible_page_name(targetTab);
                }
                GLib.unlink('/tmp/gnome_astro_tab.txt');
            }
        } catch (e) {
            // Ignore error if file does not exist
        }
    }

    _clampedLat(settings) {
        const v = settings.get_double('latitude');
        return (v >= -90 && v <= 90) ? v : 0;
    }

    _clampedLon(settings) {
        const v = settings.get_double('longitude');
        return (v >= -180 && v <= 180) ? v : 0;
    }
}
