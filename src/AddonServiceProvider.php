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

        // Only the CP's toolbar script reads these; a public page has no reason
        // to open the settings file.
        if (! Statamic::isCpRoute()) {
            return;
        }

        // `bard-styles-source` also tells the Visual Editor that this version
        // serves the list at bard-style/styles, so its popup can edit it.
        Statamic::provideToScript([
            'bard-styles' => Styles::styles(),
            'bard-groups' => Styles::groupMap(),
            'bard-styles-source' => Styles::all()['source'],
        ]);
    }
}
