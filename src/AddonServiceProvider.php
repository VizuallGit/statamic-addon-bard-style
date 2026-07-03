<?php

namespace StatamicAddon\BardStyle;

use Statamic\Fieldtypes\Bard\Augmentor;
use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Statamic;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $scripts = [
        __DIR__.'/../resources/js/addon.js',
    ];

    protected $routes = [
        'cp' => __DIR__.'/../routes/cp.php',
    ];

    public function bootAddon(): void
    {
        Augmentor::addExtension('themeColor',        new Marks\ThemeColor);
        Augmentor::addExtension('vizuStyle',         new Marks\StyleMark);
        Augmentor::addExtension('btsSpan',           new Marks\BtsSpan);
        Augmentor::addExtension('vizuParagraphStyle', new Extensions\ParagraphStyle);
        Augmentor::addExtension('vizuDiv',             new Extensions\VizuDiv);
        Augmentor::addExtension('vizuBlockStyle',      new Extensions\ParagraphBlockStyle);
        Augmentor::addExtension('vizuSpanClass',     new Marks\SpanClass);

        $allStyles = config('statamic.bard_styles.styles', []);
        $allGroups = config('statamic.bard_styles.groups', []);

        Statamic::provideToScript([
            'bard-styles' => $allStyles,
            'bard-groups' => $allGroups,
        ]);
    }
}
