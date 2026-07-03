<?php

namespace StatamicAddon\BardStyle\Extensions;

use Tiptap\Core\Node;

class VizuDiv extends Node
{
    public static $name = 'vizuDiv';

    public function addAttributes(): array
    {
        return [
            'class' => ['default' => null],
        ];
    }

    public function parseHTML(): array
    {
        return [
            ['tag' => 'div[data-vzd]'],
        ];
    }

    public function renderHTML($node, $HTMLAttributes = []): array
    {
        $class = $node->attrs->class ?? null;
        $attrs = $class ? ['class' => $class] : [];
        return ['div', $attrs, 0];
    }
}
