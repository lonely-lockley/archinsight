package com.github.lonelylockley.archinsight.model.annotations;

import com.github.lolo.ltsv.LtsvParser;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class AttributeAnnotation extends AbstractAnnotation {

    private Map<String, String> parsedValue;

    public AttributeAnnotation() {
        super(AnnotationType.ATTRIBUTE);
    }

    @Override
    public void setValue(String value) {
        super.setValue(value);
        var parser = LtsvParser
                .builder()
                .strict()
                .trimKeys()
                .trimValues()
                .withKvDelimiter('=')
                .withEntryDelimiter(',')
                .build();
        parsedValue = parser.parse(value, StandardCharsets.UTF_8).next();
    }

    public Map<String, String> getParsedValue() {
        return parsedValue;
    }

    @Override
    public AbstractAnnotation clone() {
        var res = new AttributeAnnotation();
        res.setValue(this.getValue());
        res.parsedValue = new HashMap<>(this.parsedValue);
        this.clonePositionTo(res);
        return res;
    }
}
