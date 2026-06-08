<?php

namespace StatamicAddon\BardStyle\Extensions;

use Tiptap\Core\Extension;

class ParagraphStyle extends Extension
{
    public static $name = 'vizuParagraphStyle';

    public function addGlobalAttributes()
    {
        $styles = config('statamic.bard_styles.styles', []);
        $paragraphStyles = array_filter(
            $styles,
            fn ($s) => ($s['type'] ?? 'span') === 'paragraph' && ! empty($s['class'])
        );

        if (empty($paragraphStyles)) return [];

        $knownClasses = array_values(array_column(array_values($paragraphStyles), 'class'));

        return [[
            'types'      => ['paragraph', 'heading'],
            'attributes' => [
                'vizuClass' => [
                    'default'    => null,
                    'parseHTML'  => function ($node) use ($knownClasses) {
                        $cls = $node->getAttribute('class');
                        return in_array($cls, $knownClasses) ? $cls : null;
                    },
                    'renderHTML' => function ($attributes) {
                        $cls = $attributes->vizuClass ?? null;
                        return $cls ? ['class' => $cls] : [];
                    },
                ],
            ],
        ]];
    }
}
