<?php

namespace StatamicAddon\BardStyle\Marks;

use Tiptap\Core\Mark;

class ThemeColor extends Mark
{
    public static $name = 'themeColor';

    public function parseHTML()
    {
        return [
            ['tag' => 'span[style*="color:"]'],
        ];
    }

    public function renderHTML($mark, $HTMLAttributes = [])
    {
        $color = $mark->attrs->color ?? null;

        if (! $color) {
            return ['span', is_array($HTMLAttributes) ? $HTMLAttributes : [], 0];
        }

        return ['span', ['style' => 'color: ' . $color], 0];
    }
}
