import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HideSystemIconsPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: _('General'),
      iconName: 'dialog-information-symbolic',
    });

    // System icons toggles
    const iconsGroup = new Adw.PreferencesGroup({
      title: _('Quick Settings icons'),
      description: _('Gnome shell extension settings panel for annotator.'),
    });
    page.add(iconsGroup);

    const skipTaskbar = new Adw.SwitchRow({
      title: _('Hide window icon'),
      subtitle: _('Hide the window icon of annotator from taskbar.'),
    });
    iconsGroup.add(skipTaskbar);

    const keepOnTop = new Adw.SwitchRow({
      title: _('Keep window on top'),
      subtitle: _('Keep annotator window always on top.'),
    });
    iconsGroup.add(keepOnTop);

    window.add(page);

    settings.bind('skip-taskbar', skipTaskbar, 'active', Gio.SettingsBindFlags.DEFAULT);
    settings.bind('keep-on-top', keepOnTop, 'active', Gio.SettingsBindFlags.DEFAULT);

    return Promise.resolve();
  }
}

