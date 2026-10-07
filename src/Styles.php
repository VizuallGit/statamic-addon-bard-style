<?php

namespace StatamicAddon\BardStyle;

use Illuminate\Validation\ValidationException;
use Statamic\Facades\Addon;

/**
 * The site's Bard styles, and the groups that collect styles into one toolbar
 * dropdown.
 *
 * One list, read from one place: the addon's settings file
 * (resources/addons/bard-style.yaml), which the Live Preview editor writes and
 * the starter kit ships. A site that has never saved there still has the older
 * config/statamic/bard_styles.php; that is read until the first save writes the
 * settings file, and from then on the file is the list.
 *
 * Shapes:
 *   groups: [{handle, name, ident}]                 — order is toolbar order
 *   styles: [{handle, type, name, ident, group?, …}] — order is toolbar order
 *     span:      prop, value, target? ('block' = the whole paragraph)
 *     paragraph: class, cp_css?
 *     div:       class, cp_css?
 */
class Styles
{
    public const ADDON_ID = 'statamic-addon/bard-style';

    public const TYPES = ['span', 'paragraph', 'div'];

    protected static ?array $cache = null;

    /** @return array{groups: array, styles: array, source: string} */
    public static function all(): array
    {
        if (static::$cache !== null) {
            return static::$cache;
        }

        $saved = static::saved();

        if (array_key_exists('styles', $saved)) {
            return static::$cache = [
                'groups' => array_values((array) ($saved['groups'] ?? [])),
                'styles' => array_values((array) $saved['styles']),
                'source' => 'settings',
            ];
        }

        $legacy = (array) config('statamic.bard_styles', []);

        return static::$cache = [
            'groups' => static::groupsFromMap((array) ($legacy['groups'] ?? [])),
            'styles' => array_values((array) ($legacy['styles'] ?? [])),
            'source' => $legacy ? 'config' : 'none',
        ];
    }

    public static function styles(): array
    {
        return static::all()['styles'];
    }

    /** Groups keyed by handle — the shape the Bard toolbar script reads. */
    public static function groupMap(): array
    {
        $map = [];

        foreach (static::all()['groups'] as $group) {
            $map[$group['handle']] = ['name' => $group['name'] ?? $group['handle'], 'ident' => $group['ident'] ?? ''];
        }

        return $map;
    }

    /**
     * Validate, normalise and write both lists. Throws a ValidationException
     * keyed like the request (`styles.3.handle`) so the editor can point at the
     * field.
     */
    public static function save(array $groups, array $styles): array
    {
        $errors = [];
        $groups = static::normaliseGroups($groups, $errors);
        $styles = static::normaliseStyles($styles, array_column($groups, 'handle'), $errors);

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        Addon::get(static::ADDON_ID)->settings()->set(['groups' => $groups, 'styles' => $styles])->save();

        static::flush();

        return static::all();
    }

    public static function flush(): void
    {
        static::$cache = null;
    }

    protected static function saved(): array
    {
        try {
            return Addon::get(static::ADDON_ID)?->settings()->raw() ?? [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** config's `groups` is a map (handle => {name, ident}); the list keeps order the same way. */
    protected static function groupsFromMap(array $map): array
    {
        $groups = [];

        foreach ($map as $handle => $meta) {
            $groups[] = ['handle' => (string) $handle, 'name' => $meta['name'] ?? (string) $handle, 'ident' => $meta['ident'] ?? ''];
        }

        return $groups;
    }

    protected static function normaliseGroups(array $groups, array &$errors): array
    {
        $out = [];
        $seen = [];

        foreach (array_values($groups) as $i => $group) {
            $handle = trim((string) ($group['handle'] ?? ''));
            $name = trim((string) ($group['name'] ?? ''));
            $ident = trim((string) ($group['ident'] ?? ''));

            if (! preg_match('/^[a-z][a-z0-9_-]*$/', $handle)) {
                $errors["groups.$i.handle"] = 'handle_format';
            } elseif (isset($seen[$handle])) {
                $errors["groups.$i.handle"] = 'handle_taken';
            }

            if ($name === '') {
                $errors["groups.$i.name"] = 'required';
            }

            if (! static::identOk($ident)) {
                $errors["groups.$i.ident"] = 'ident_format';
            }

            $seen[$handle] = true;
            $out[] = ['handle' => $handle, 'name' => $name, 'ident' => $ident];
        }

        return $out;
    }

    protected static function normaliseStyles(array $styles, array $groupHandles, array &$errors): array
    {
        $out = [];
        $seen = [];

        foreach (array_values($styles) as $i => $style) {
            $handle = trim((string) ($style['handle'] ?? ''));
            $type = (string) ($style['type'] ?? 'span');
            $name = trim((string) ($style['name'] ?? ''));
            $ident = trim((string) ($style['ident'] ?? ''));
            $group = trim((string) ($style['group'] ?? ''));

            if (! preg_match('/^[a-z][a-z0-9_]*$/', $handle)) {
                $errors["styles.$i.handle"] = 'handle_format';
            } elseif (isset($seen[$handle])) {
                $errors["styles.$i.handle"] = 'handle_taken';
            }

            $seen[$handle] = true;

            if (! in_array($type, static::TYPES, true)) {
                $errors["styles.$i.type"] = 'type';
            }

            if ($name === '') {
                $errors["styles.$i.name"] = 'required';
            }

            if (! static::identOk($ident)) {
                $errors["styles.$i.ident"] = 'ident_format';
            }

            $row = ['handle' => $handle, 'type' => $type, 'name' => $name, 'ident' => $ident];

            if ($type === 'span') {
                $prop = trim((string) ($style['prop'] ?? ''));
                $value = trim((string) ($style['value'] ?? ''));

                if (! preg_match('/^(--)?[a-z][a-z0-9-]*$/', $prop)) {
                    $errors["styles.$i.prop"] = 'prop_format';
                }

                if ($value === '' || preg_match('/[;{}<>"]/', $value)) {
                    $errors["styles.$i.value"] = 'value_format';
                }

                $row['prop'] = $prop;
                $row['value'] = $value;

                if (($style['target'] ?? '') === 'block') {
                    $row['target'] = 'block';
                }
            } else {
                $class = trim(preg_replace('/\s+/', ' ', (string) ($style['class'] ?? '')));
                $css = trim((string) ($style['cp_css'] ?? ''));

                if (! preg_match('/^-?[A-Za-z_][A-Za-z0-9_-]*( -?[A-Za-z_][A-Za-z0-9_-]*)*$/', $class)) {
                    $errors["styles.$i.class"] = 'class_format';
                }

                if (preg_match('/[{}<>]/', $css)) {
                    $errors["styles.$i.cp_css"] = 'css_format';
                }

                $row['class'] = $class;

                if ($css !== '') {
                    $row['cp_css'] = $css;
                }
            }

            if ($group !== '') {
                if (! in_array($group, $groupHandles, true)) {
                    $errors["styles.$i.group"] = 'group_missing';
                } elseif ($type === 'div') {
                    // The group dropdown sets a mark or a paragraph class; a
                    // wrapper div is a node of its own and only works as a button.
                    $errors["styles.$i.group"] = 'group_div';
                }

                $row['group'] = $group;
            }

            $out[] = $row;
        }

        return $out;
    }

    /**
     * A few letters, or an inline <svg>. It is drawn with innerHTML in the
     * toolbar, so markup is held to an svg without handlers or script.
     */
    protected static function identOk(string $ident): bool
    {
        if (! str_starts_with($ident, '<')) {
            return mb_strlen($ident) <= 6;
        }

        return str_starts_with($ident, '<svg')
            && mb_strlen($ident) <= 4000
            && ! preg_match('/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i', $ident);
    }
}
