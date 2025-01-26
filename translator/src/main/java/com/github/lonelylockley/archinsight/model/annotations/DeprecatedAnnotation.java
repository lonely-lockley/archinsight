package com.github.lonelylockley.archinsight.model.annotations;

public class DeprecatedAnnotation extends AbstractAnnotation {
    public DeprecatedAnnotation() {
        super(AnnotationType.DEPRECATED);
    }

    @Override
    public AbstractAnnotation clone() {
        var res = new DeprecatedAnnotation();
        res.setValue(this.getValue());
        this.clonePositionTo(res);
        return res;
    }
}
