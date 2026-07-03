<?php

namespace StatamicAddon\BardStyle\Extensions;

use Tiptap\Core\Extension;

class ParagraphBlockStyle extends Extension
{
    public static $name = 'vizuBlockStyle';

    public function addGlobalAttributes()
    {
        return [[
            'types'      => ['paragraph', 'heading'],
            'attributes' => [
                'vizuBlockStyle' => [
                    'default'    => null,
                    'parseHTML'  => fn ($node) => $node->getAttribute('data-vbs') ?: null,
                    'renderHTML' => function ($attributes) {
                        $style = $attributes->vizuBlockStyle ?? null;
                        return $style ? ['style' => $style] : [];
                    },
                ],
            ],
        ]];
    }
}
