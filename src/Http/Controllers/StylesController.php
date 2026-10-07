<?php

namespace StatamicAddon\BardStyle\Http\Controllers;

use Illuminate\Http\Request;
use Statamic\Facades\User;
use StatamicAddon\BardStyle\Styles;

/**
 * The style list for the editor that creates and changes styles (the Visual
 * Editor's top-bar popup). Reading needs the CP; writing needs `configure
 * fields` — the same permission as the blueprints the Bard buttons are picked in.
 */
class StylesController
{
    public function index()
    {
        return response()->json(Styles::all() + ['can_edit' => static::canEdit()]);
    }

    public function update(Request $request)
    {
        abort_unless(static::canEdit(), 403);

        $saved = Styles::save((array) $request->input('groups', []), (array) $request->input('styles', []));

        return response()->json($saved + ['can_edit' => true]);
    }

    protected static function canEdit(): bool
    {
        return (bool) User::current()?->can('configure fields');
    }
}
