<?php

namespace StatamicAddon\BardStyle\Marks;

use Tiptap\Core\Mark;

class BtsSpan extends Mark
{
    public static $name = 'btsSpan';

    protected static ?array $styleMap = null;

    protected static function styleMap(): array
    {
        if (static::$styleMap !== null) return static::$styleMap;

        $styles = config('statamic.bard_styles.styles', []);
        $map    = [];

        foreach ($styles as $style) {
            if (($style['type'] ?? 'span') !== 'span') continue;
            $cls       = str_replace('_', '-', $style['handle']);
            $map[$cls] = ['prop' => $style['prop'], 'value' => $style['value']];
        }

        return static::$styleMap = $map;
    }

    public function parseHTML()
    {
        return [
            ['tag' => 'span[data-bts-style]'],
            ['tag' => 'span'],
        ];
    }

    public function renderHTML($mark, $HTMLAttributes = [])
    {
        $class = $mark->attrs->class ?? null;
        if (! $class) return ['span', [], 0];

        $def = static::styleMap()[$class] ?? null;

        if ($def) {
            return ['span', ['style' => "{$def['prop']}: {$def['value']}"], 0];
        }

        return ['span', ['class' => $class], 0];
    }
}
